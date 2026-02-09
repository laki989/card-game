const { useState, useEffect, useRef } = React;

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const SUIT_SYMBOLS = {
  'acorns': 'img/a-symbol.png',
  'leaves': 'img/l-symbol.png',
  'hearts': 'img/h-symbol.png',
  'bells': 'img/b-symbol.png'
};

const SUIT_NAMES = {
  'acorns': 'Acorns',
  'leaves': 'Leaves',
  'hearts': 'Hearts',
  'bells': 'Bells'
};

const RANK_ORDER = { 'A': 7, 'K': 6, 'Q': 5, 'J': 4, '10': 3, '9': 2, '8': 1, '7': 0 };
const SUIT_ORDER = ['hearts', 'bells', 'leaves', 'acorns'];

// Suit Icon Component
function SuitIcon({ suit, size = '24px', style = {} }) {
  return (
    <img 
      src={SUIT_SYMBOLS[suit]} 
      alt={SUIT_NAMES[suit]}
      style={{ 
        width: size, 
        height: size, 
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style 
      }}
    />
  );
}

const LORUM_CONTRACTS = [
  { id: 1, name: 'Minimum', nameLocal: 'Minimum', description: 'Avoid tricks (+1 per trick)' },
  { id: 2, name: 'Maximum', nameLocal: 'Maksimum', description: 'Win 2+ tricks (0-1 = +8)' },
  { id: 3, name: 'Queens', nameLocal: 'Dame', description: 'Avoid queens (+2 per queen)' },
  { id: 4, name: 'Hearts', nameLocal: 'Srca', description: 'Avoid hearts (+1 each) or take all (-8)' },
  { id: 5, name: 'Jack of Clubs', nameLocal: 'Žandar tref', description: 'Avoid Jack of Clubs (+8)' },
  { id: 6, name: 'King of Hearts', nameLocal: 'Kralj srce', description: 'Avoid King of Hearts (+8)' },
  { id: 7, name: 'Lora', nameLocal: 'Ređanje', description: 'First out (-8), others (+1 per card + pass)' }
];

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return RANK_ORDER[b.rank] - RANK_ORDER[a.rank];
  });
}

function getCardImagePath(card) {
  const suitPrefix = { 'hearts': 'H', 'bells': 'B', 'leaves': 'L', 'acorns': 'A' };
  const rankSuffix = { 'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', '10': '10', '9': '09', '8': '08', '7': '07' };
  return `img/${suitPrefix[card.suit]}-${rankSuffix[card.rank]}.webp`;
}

function getNextRank(rank) {
  const sequence = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const index = sequence.indexOf(rank);
  return sequence[(index + 1) % 8];
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function Card({ card, onClick, disabled }) {
  return (
    <div className={`card ${disabled ? 'disabled' : ''}`} onClick={disabled ? undefined : onClick}>
      <img src={getCardImagePath(card)} alt={`${card.rank} of ${card.suit}`} />
    </div>
  );
}

function GameHistory({ history, players, onClose }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Game History</h2>
        {history.length === 0 ? <p>No rounds played yet.</p> : (
          history.map((round, idx) => (
            <div key={idx} className="history-entry">
              <h3>Round {idx + 1}</h3>
              <p><strong>Dealer:</strong> {players[round.dealer]?.name}</p>
              <p><strong>Winner:</strong> {players[round.bidWinner]?.name} (bid: {round.bids[round.bidWinner]})</p>
              {round.isBetl && <p><strong>Type:</strong> Betl</p>}
              {round.trump && (
                <p>
                  <strong>Trump:</strong> <SuitIcon suit={round.trump} size="20px" style={{ marginLeft: '8px' }} />
                </p>
              )}
              <p><strong>Tricks:</strong> {round.tricksTaken.map((t, i) => `${players[i]?.name}: ${t}`).join(', ')}</p>
              <p><strong>Round Scores:</strong> {round.roundScores.map((s, i) => `${players[i]?.name}: ${s > 0 ? '+' : ''}${s}`).join(', ')}</p>
              <p><strong>Total:</strong> {round.totalScores.map((s, i) => `${players[i]?.name}: ${s}`).join(', ')}</p>
            </div>
          ))
        )}
        <button className="close-button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Chat({ socket, gameCode, playerIndex }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('chat_message', ({ playerName, playerIndex: senderIndex, message, timestamp }) => {
      setMessages(prev => [...prev, { playerName, playerIndex: senderIndex, message, timestamp }]);
    });
    return () => { socket.off('chat_message'); };
  }, [socket]);

  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

  const sendMessage = () => {
    if (!inputMessage.trim()) return;
    socket.emit('chat_message', { gameId: gameCode, message: inputMessage.trim() });
    setInputMessage('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`chat-panel ${isMinimized ? 'minimized' : ''}`}>
      <div className="chat-header">
        <span className="chat-title">💬 Chat</span>
        <button className="chat-toggle" onClick={() => setIsMinimized(!isMinimized)}>
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>
      {!isMinimized && (
        <>
          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.playerIndex === playerIndex ? 'own' : ''}`}>
                <div className="chat-message-header">
                  <span className="chat-message-player">{msg.playerName}</span>
                  <span className="chat-message-time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="chat-message-text">{msg.message}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              maxLength={200}
            />
            <button className="chat-send-button" onClick={sendMessage} disabled={!inputMessage.trim()}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// GAME SELECTION LOBBY
// ============================================================================

// Game Selection Lobby - Choose between Mexico and Lorum
function GameSelectionLobby({ onCreateGame, onJoinGame }) {
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [contractMode, setContractMode] = useState('fixed'); // 'fixed' or 'choice'

  const games = [
    {
      id: 'mexico',
      name: 'Mexico',
      icon: '🎴',
      players: '3 players',
      description: 'Bidding and trick-taking game'
    },
    {
      id: 'lorum',
      name: 'Lorum',
      icon: '🃏',
      players: '4 players',
      description: '7 contracts compendium game'
    }
  ];

  const handleCreateWithGame = () => {
    if (!playerName || !selectedGame) return;
    const gameConfig = { 
      gameType: selectedGame,
      contractMode: selectedGame === 'lorum' ? contractMode : null
    };
    onCreateGame(playerName, gameConfig);
  };

  if (!selectedGame) {
    return (
      <div className="lobby">
        <h1>🎲 Card Games</h1>
        <input 
          type="text" 
          placeholder="Enter your name" 
          value={playerName} 
          onChange={(e) => setPlayerName(e.target.value)} 
        />
        
        <div style={{ margin: '30px 0' }}>
          <h2 style={{ marginBottom: '15px', fontSize: '1.3rem' }}>Select a Game:</h2>
          <div style={{ display: 'flex', gap: '15px', flexDirection: 'column' }}>
            {games.map(game => (
              <div 
                key={game.id}
                onClick={() => playerName && setSelectedGame(game.id)}
                style={{
                  padding: '20px',
                  background: 'white',
                  borderRadius: '8px',
                  cursor: playerName ? 'pointer' : 'not-allowed',
                  opacity: playerName ? 1 : 0.5,
                  border: '3px solid var(--forest-dark)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px'
                }}
                onMouseEnter={(e) => playerName && (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ fontSize: '3rem' }}>{game.icon}</div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--forest-dark)' }}>
                    {game.name}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>
                    {game.players} • {game.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-buttons">
          <button onClick={() => setShowJoin(!showJoin)}>
            {showJoin ? 'Cancel' : 'Join Existing Game'}
          </button>
          {showJoin && (
            <>
              <input 
                type="text" 
                placeholder="Enter game code" 
                value={gameCode} 
                onChange={(e) => setGameCode(e.target.value.toUpperCase())} 
              />
              <button 
                onClick={() => playerName && gameCode && onJoinGame(gameCode, playerName)} 
                disabled={!playerName || !gameCode}
              >
                Join Game
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Game selected - show options
  const gameInfo = games.find(g => g.id === selectedGame);
  
  return (
    <div className="lobby">
      <h1>{gameInfo.icon} {gameInfo.name}</h1>
      <p style={{ fontSize: '1.1rem', marginBottom: '20px' }}>{gameInfo.description}</p>

      {selectedGame === 'lorum' && (
        <div style={{ 
          background: 'white', 
          padding: '20px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '2px solid var(--forest-dark)'
        }}>
          <h3 style={{ marginBottom: '15px', color: 'var(--forest-dark)' }}>Contract Mode:</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setContractMode('fixed')}
              style={{
                flex: 1,
                padding: '15px',
                background: contractMode === 'fixed' ? 'var(--gold)' : 'white',
                border: '2px solid var(--forest-dark)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: contractMode === 'fixed' ? 'bold' : 'normal'
              }}
            >
              Fixed Order
              <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                Play contracts 1→7
              </div>
            </button>
            <button
              onClick={() => setContractMode('choice')}
              style={{
                flex: 1,
                padding: '15px',
                background: contractMode === 'choice' ? 'var(--gold)' : 'white',
                border: '2px solid var(--forest-dark)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: contractMode === 'choice' ? 'bold' : 'normal'
              }}
            >
              Player Choice
              <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                Dealer picks contract
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="lobby-buttons">
        <button onClick={handleCreateWithGame}>
          Create {gameInfo.name} Game
        </button>
        <button onClick={() => setSelectedGame(null)}>
          ← Back to Game Selection
        </button>
      </div>
    </div>
  );
}


// ============================================================================
// MEXICO GAME COMPONENT
// ============================================================================

// MexicoGame.js - 3-player Mexico card game component

function MexicoGame({ socket, gameState, playerIndex, gameCode, onError }) {
  const [selectedDiscards, setSelectedDiscards] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Reset selected discards when leaving talon phase
  useEffect(() => {
    if (gameState.state !== 'talon_reveal') {
      setSelectedDiscards([]);
    }
  }, [gameState.state]);

  // Event Handlers
  const handleBid = (bid) => socket.emit('bid', { gameId: gameCode, bid });
  
  const handlePlayCard = (card) => {
    if (gameState.state !== 'playing' || gameState.currentPlayer !== playerIndex) return;
    socket.emit('play_card', { gameId: gameCode, card });
  };
  
  const handleTalonTake = () => {
    if (selectedDiscards.length !== 2) {
      onError('Select exactly 2 cards');
      return;
    }
    socket.emit('take_talon', { gameId: gameCode, discards: selectedDiscards });
  };
  
  const handleSelectTrump = (trump) => socket.emit('select_trump', { gameId: gameCode, trump });
  
  const handleResetGame = () => {
    if (confirm('Reset game to 0 points?')) {
      socket.emit('reset_game', { gameId: gameCode });
      setShowMenu(false);
    }
  };
  
  const handleLeaveGame = () => {
    if (confirm('Leave game?')) {
      window.location.reload();
    }
  };
  
  const toggleDiscard = (card) => {
    const cardStr = `${card.suit}-${card.rank}`;
    const existing = selectedDiscards.find(c => `${c.suit}-${c.rank}` === cardStr);
    if (existing) {
      setSelectedDiscards(selectedDiscards.filter(c => `${c.suit}-${c.rank}` !== cardStr));
    } else if (selectedDiscards.length < 2) {
      setSelectedDiscards([...selectedDiscards, card]);
    }
  };

  // Safety Checks
  if (!gameState.players || gameState.players.length < 3 || playerIndex === null ||
      !gameState.bids || !gameState.tricksTaken || !gameState.scores || !gameState.passedPlayers) {
    return <div className="waiting-message">Loading...</div>;
  }

  const currentPlayer = gameState.players[playerIndex];
  if (!currentPlayer) {
    return <div className="waiting-message">Loading players...</div>;
  }

  const isMyTurn = gameState.currentPlayer === playerIndex;
  
  // Calculate highest bid
  const numericBids = gameState.bids.filter(b => b !== null && b !== 'pass' && b !== 'betl').map(b => b === 'mexico' ? 20 : parseInt(b));
  const currentHighestBid = numericBids.length > 0 ? Math.max(...numericBids) : 0;
  const hasBetlBid = gameState.bids.some(b => b === 'betl');

  // Player Positions (relative to current player)
  const playerPositions = ['bottom', 'left', 'right'].map((pos, idx) => {
    const actualPlayerIdx = (playerIndex + idx) % 3;
    return {
      position: pos,
      player: gameState.players[actualPlayerIdx],
      playerIdx: actualPlayerIdx,
      isMe: actualPlayerIdx === playerIndex
    };
  });

  return (
    <>
      {/* History Modal */}
      {showHistory && (
        <GameHistory history={gameState.gameHistory} players={gameState.players} onClose={() => setShowHistory(false)} />
      )}

      {/* Header */}
      <div className="game-header">
        <div className="game-info">
          <div className="game-info-item"><span>Game: {gameCode}</span></div>
          {gameState.trump && (
            <div className="game-info-item">
              <span>Trump:</span>
              <div className="trump-indicator">
                <SuitIcon suit={gameState.trump} size="32px" />
              </div>
            </div>
          )}
          {gameState.bidWinner !== null && (
            <div className="game-info-item">
              <span>Contract: {gameState.bids[gameState.bidWinner]} by {gameState.players[gameState.bidWinner]?.name}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', position: 'relative' }}>
          <button className="history-button" onClick={() => setShowHistory(true)}>View History</button>
          <button className="menu-button" onClick={() => setShowMenu(!showMenu)}>Menu ☰</button>
          {showMenu && (
            <div className="menu-dropdown">
              <div className="menu-item" onClick={handleResetGame}>🔄 Reset Game</div>
              <div className="menu-item" onClick={handleLeaveGame}>🚪 Leave Game</div>
            </div>
          )}
        </div>
      </div>

      {/* Table Area */}
      <div className="table-area">
        {/* Opponent Positions */}
        {playerPositions.filter(p => !p.isMe).map(({ position, player, playerIdx }) => (
          <div key={playerIdx} className={`player-position ${position}`}>
            <div className="player-card">
              <div className="player-avatar">{player.name.charAt(0).toUpperCase()}</div>
              <div className="player-info">
                <div className="player-name-display">
                  {player.name}
                  {gameState.currentPlayer === playerIdx && <span className="turn-indicator"></span>}
                </div>
                <div className="player-stats-display">
                  Score: {gameState.scores[playerIdx]} / Tricks: {gameState.tricksTaken[playerIdx]}
                </div>
              </div>
            </div>
            {gameState.hand && gameState.hand.length > 0 && (
              <div className="opponent-cards">
                {[...Array(Math.min(gameState.hand.length, 10))].map((_, i) => (
                  <div key={i} className="card-back"></div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Center Play Area */}
        <div className="play-area">
          {/* Bidding */}
          {gameState.state === 'bidding' && (
            <div className="bidding-panel">
              <h2>Bidding Phase</h2>
              {gameState.bids.some(b => b !== null) && (
                <div className="current-bid-display">
                  <div>Current Bids:</div>
                  <div className="bid-list">
                    {gameState.players.map((player, idx) => (
                      <div key={idx} className="bid-item">
                        <div>{player.name}</div>
                        <div className="bid-value">{gameState.bids[idx] === null ? '—' : gameState.bids[idx]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isMyTurn && !gameState.passedPlayers[playerIndex] ? (
                <div className="bid-buttons">
                  {[5, 6, 7, 8, 9, 10].map(bid => {
                    const isFirstBid = gameState.bids.every(b => b === null);
                    let disabled = false;
                    if (bid <= currentHighestBid && !isFirstBid) disabled = true;
                    if (bid === 5 && !isFirstBid) disabled = true;
                    if (hasBetlBid && bid < 7) disabled = true;
                    return (
                      <button key={bid} className="bid-button" onClick={() => handleBid(bid)} disabled={disabled}>
                        {bid}
                      </button>
                    );
                  })}
                  <button className="bid-button betl" onClick={() => handleBid('betl')} disabled={currentHighestBid >= 7}>
                    Betl
                  </button>
                  <button className="bid-button mexico-btn" onClick={() => handleBid('mexico')}>
                    Mexico
                  </button>
                  <button 
                    className="bid-button pass" 
                    onClick={() => handleBid('pass')}
                    disabled={gameState.bids.every(b => b === null) && playerIndex === (gameState.currentDealer + 1) % 3}
                  >
                    Pass
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '20px', fontSize: '1.2rem' }}>
                  {gameState.passedPlayers[playerIndex] ? 'You passed' : `Waiting for ${gameState.players[gameState.currentPlayer]?.name}...`}
                </div>
              )}
            </div>
          )}

          {/* Talon */}
          {gameState.state === 'talon_reveal' && (
            <div className="talon-display">
              <h2>Talon Cards</h2>
              <div className="talon-cards">
                {gameState.talon.map((card, idx) => <Card key={idx} card={card} disabled={true} />)}
              </div>
              {playerIndex === gameState.bidWinner ? (
                <div className="discard-selection">
                  <div className="discard-info">
                    Cards added to your hand below
                    <br/>Select 2 to discard ({selectedDiscards.length}/2)
                  </div>
                  <button className="bid-button" onClick={handleTalonTake} disabled={selectedDiscards.length !== 2}>
                    Confirm Discards
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '20px', fontSize: '1.2rem' }}>
                  Waiting for {gameState.players[gameState.bidWinner]?.name}...
                </div>
              )}
            </div>
          )}

          {/* Trump Selection */}
          {gameState.state === 'trump_selection' && (
            <div className="talon-display">
              <h2>Select Trump</h2>
              {playerIndex === gameState.bidWinner ? (
                <div className="trump-selection">
                  {Object.keys(SUIT_SYMBOLS).map((suit) => (
                    <button key={suit} className="trump-button" onClick={() => handleSelectTrump(suit)}>
                      <SuitIcon suit={suit} size="48px" />
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: '20px', fontSize: '1.2rem' }}>
                  Waiting for {gameState.players[gameState.bidWinner]?.name}...
                </div>
              )}
            </div>
          )}

          {/* Playing */}
          {(gameState.state === 'playing' || gameState.state === 'trick_complete') && (
            <div className="trick-display">
              {gameState.currentTrick.map((play, idx) => (
                <div key={idx} className="trick-card-wrapper">
                  <Card card={play.card} disabled={true} />
                  <div className="trick-player-label">{gameState.players[play.playerIndex]?.name}</div>
                </div>
              ))}
              {gameState.state === 'trick_complete' && gameState.lastTrickWinner !== null && (
                <div className="trick-winner-notification">
                  🏆 {gameState.players[gameState.lastTrickWinner]?.name} takes the trick!
                </div>
              )}
            </div>
          )}

          {/* Game Over */}
          {gameState.state === 'finished' && (
            <div className="bidding-panel">
              <h2>Game Over!</h2>
              <div style={{ fontSize: '1.5rem', marginTop: '20px' }}>
                {gameState.scores.map((score, idx) => (
                  <div key={idx} style={{ margin: '10px 0' }}>
                    {gameState.players[idx]?.name}: {score} points
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '1.8rem', marginTop: '30px', color: 'var(--gold)' }}>
                Winner: {gameState.players[gameState.scores.indexOf(Math.max(...gameState.scores))]?.name}!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player Hand */}
      <div className="player-hand-area">
        <div className="hand-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="player-avatar">{currentPlayer.name.charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
                {currentPlayer.name}
                {isMyTurn && <span className="turn-indicator"></span>}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#ddd' }}>
                Score: {gameState.scores[playerIndex]} / Tricks: {gameState.tricksTaken[playerIndex]}
              </div>
            </div>
          </div>
        </div>
        <div className="hand">
          {sortHand(gameState.hand).map((card, idx) => {
            const cardKey = `${card.suit}-${card.rank}`;
            const isSelected = selectedDiscards.some(c => `${c.suit}-${c.rank}` === cardKey);
            const canPlay = gameState.state === 'playing' && isMyTurn;
            const isDiscarding = gameState.state === 'talon_reveal' && playerIndex === gameState.bidWinner;
            
            return (
              <div key={idx} style={{ position: 'relative', transform: isSelected ? 'translateY(-15px)' : 'none', transition: 'transform 0.2s' }}>
                <Card 
                  card={card} 
                  onClick={() => {
                    if (canPlay) handlePlayCard(card);
                    else if (isDiscarding) toggleDiscard(card);
                  }}
                  disabled={!canPlay && !isDiscarding}
                />
                {isSelected && isDiscarding && (
                  <div style={{
                    position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--red)', color: 'white', padding: '2px 8px',
                    borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'
                  }}>
                    Discard
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}


// ============================================================================
// LORUM GAME COMPONENT  
// ============================================================================

// LorumGame.js - 4-player Lorum compendium game component

const CONTRACTS = [
  { id: 1, name: 'Minimum', nameLocal: 'Minimum', description: 'Avoid tricks (+1 per trick)' },
  { id: 2, name: 'Maximum', nameLocal: 'Maksimum', description: 'Win 2+ tricks (0-1 = +8)' },
  { id: 3, name: 'Queens', nameLocal: 'Dame', description: 'Avoid queens (+2 per queen)' },
  { id: 4, name: 'Hearts', nameLocal: 'Srca', description: 'Avoid hearts (+1 each) or take all (-8)' },
  { id: 5, name: 'Jack of Clubs', nameLocal: 'Žandar tref', description: 'Avoid Jack of Clubs (+8)' },
  { id: 6, name: 'King of Hearts', nameLocal: 'Kralj srce', description: 'Avoid King of Hearts (+8)' },
  { id: 7, name: 'Lora', nameLocal: 'Ređanje', description: 'First out (-8), others (+1 per card + pass)' }
];

function LorumGame({ socket, gameState, playerIndex, gameCode, onError }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);

  // Event Handlers
  const handleSelectContract = (contractId) => {
    socket.emit('select_contract', { gameId: gameCode, contractId });
  };
  
  const handlePlayCard = (card) => {
    if (gameState.state === 'lora_playing') {
      socket.emit('play_lora_card', { gameId: gameCode, card });
    } else if (gameState.state === 'playing') {
      if (gameState.currentPlayer !== playerIndex) return;
      socket.emit('play_lorum_card', { gameId: gameCode, card });
    }
  };
  
  const handlePassLora = () => {
    socket.emit('pass_lora', { gameId: gameCode });
  };
  
  const handleResetGame = () => {
    if (confirm('Reset game to 0 points?')) {
      socket.emit('reset_game', { gameId: gameCode });
      setShowMenu(false);
    }
  };
  
  const handleLeaveGame = () => {
    if (confirm('Leave game?')) {
      window.location.reload();
    }
  };

  // Safety Checks
  if (!gameState.players || gameState.players.length < 4 || playerIndex === null) {
    return <div className="waiting-message">Loading...</div>;
  }

  const currentPlayer = gameState.players[playerIndex];
  if (!currentPlayer) {
    return <div className="waiting-message">Loading players...</div>;
  }

  const isMyTurn = gameState.currentPlayer === playerIndex;
  const currentContract = CONTRACTS.find(c => c.id === gameState.currentContract);

  // Player Positions for 4 players (relative to current player)
  const playerPositions = ['bottom', 'left', 'top', 'right'].map((pos, idx) => {
    const actualPlayerIdx = (playerIndex + idx) % 4;
    return {
      position: pos,
      player: gameState.players[actualPlayerIdx],
      playerIdx: actualPlayerIdx,
      isMe: actualPlayerIdx === playerIndex
    };
  });

  // Check if card can be played in Lora
  const canPlayLoraCard = (card) => {
    if (!gameState.loraStartRank) return true; // First card, any is OK
    
    const suitPile = gameState.loraLayout[card.suit];
    if (suitPile.length === 0) {
      return card.rank === gameState.loraStartRank;
    } else {
      const lastCard = suitPile[suitPile.length - 1];
      const nextRank = getNextRank(lastCard.rank);
      return card.rank === nextRank;
    }
  };
  
  const hasValidLoraCard = () => {
    return gameState.hand.some(card => canPlayLoraCard(card));
  };

  return (
    <>
      {/* Header */}
      <div className="game-header">
        <div className="game-info">
          <div className="game-info-item"><span>Lorum: {gameCode}</span></div>
          {currentContract && (
            <div className="game-info-item">
              <span>Contract: {currentContract.name} ({currentContract.nameLocal})</span>
            </div>
          )}
          <div className="game-info-item">
            <span>Deal: {gameState.currentDeal + 1}/28</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', position: 'relative' }}>
          <button className="menu-button" onClick={() => setShowMenu(!showMenu)}>Menu ☰</button>
          {showMenu && (
            <div className="menu-dropdown">
              <div className="menu-item" onClick={handleResetGame}>🔄 Reset Game</div>
              <div className="menu-item" onClick={handleLeaveGame}>🚪 Leave Game</div>
            </div>
          )}
        </div>
      </div>

      {/* Table Area */}
      <div className="table-area">
        {/* 4 Player Positions */}
        {playerPositions.filter(p => !p.isMe).map(({ position, player, playerIdx }) => (
          <div key={playerIdx} className={`player-position ${position}`}>
            <div className="player-card">
              <div className="player-avatar">{player.name.charAt(0).toUpperCase()}</div>
              <div className="player-info">
                <div className="player-name-display">
                  {player.name}
                  {gameState.currentPlayer === playerIdx && <span className="turn-indicator"></span>}
                </div>
                <div className="player-stats-display">
                  Score: {gameState.scores[playerIdx]}
                  {gameState.currentContract !== 7 && gameState.tricksTaken && ` • Tricks: ${gameState.tricksTaken[playerIdx]}`}
                  {gameState.runningScores && gameState.runningScores[playerIdx] > 0 && ` • Round: +${gameState.runningScores[playerIdx]}`}
                  {gameState.currentContract === 7 && ` • Passes: ${gameState.loraPasses[playerIdx]}`}
                </div>
              </div>
            </div>
            {gameState.hand && gameState.hand.length > 0 && (
              <div className="opponent-cards">
                {[...Array(gameState.handCounts?.[playerIdx] || gameState.hand.length)].map((_, i) => (
                  <div key={i} className="card-back"></div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Center Play Area */}
        <div className="play-area">
          {/* Contract Selection */}
          {gameState.state === 'contract_selection' && (
            <div className="bidding-panel" style={{ minWidth: '600px' }}>
              <h2>Select Contract</h2>
              <p style={{ marginBottom: '20px' }}>
                {playerIndex === gameState.contractSelector ? 'You are first player - choose a contract:' : `Waiting for ${gameState.players[gameState.contractSelector]?.name} to choose...`}
              </p>
              {playerIndex === gameState.contractSelector && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {CONTRACTS.map(contract => (
                    <button
                      key={contract.id}
                      className="bid-button"
                      onClick={() => handleSelectContract(contract.id)}
                      disabled={gameState.usedContracts[contract.id - 1]}
                      style={{
                        padding: '15px',
                        textAlign: 'left',
                        opacity: gameState.usedContracts[contract.id - 1] ? 0.3 : 1
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                        {contract.id}. {contract.name}
                      </div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                        {contract.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lora/Ređanje Layout (Contract 7) */}
          {gameState.state === 'lora_playing' && (
            <div className="lora-layout">
              <h3 style={{ textAlign: 'center', color: 'var(--gold)', marginBottom: '20px' }}>
                Lora/Ređanje - Start: {gameState.loraStartRank || '?'}
              </h3>
              <div className="lora-columns">
                {['hearts', 'bells', 'leaves', 'acorns'].map(suit => (
                  <div key={suit} className="lora-column">
                    <div className="lora-suit-header">
                      <SuitIcon suit={suit} size="36px" />
                    </div>
                    <div className="lora-cards">
                      {gameState.loraLayout[suit].length === 0 ? (
                        <div className="lora-empty-slot">Empty</div>
                      ) : (
                        gameState.loraLayout[suit].map((card, idx) => (
                          <div key={idx} style={{ marginTop: idx > 0 ? '-50px' : '0' }}>
                            <Card card={card} disabled={true} />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {isMyTurn && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  {hasValidLoraCard() ? (
                    <div style={{ color: 'var(--gold)', fontSize: '1.1rem' }}>
                      Your turn - play a card from your hand
                    </div>
                  ) : (
                    <button className="bid-button" onClick={handlePassLora}>
                      Pass (No valid cards)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Regular Trick-Taking (Contracts 1-6) */}
          {(gameState.state === 'playing' || gameState.state === 'trick_complete') && (
            <div>
              {currentContract && (
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <h2 style={{ color: 'var(--gold)' }}>{currentContract.name}</h2>
                  <p style={{ fontSize: '1rem', opacity: 0.9 }}>{currentContract.description}</p>
                </div>
              )}
              <div className="trick-display">
                {gameState.currentTrick.map((play, idx) => (
                  <div key={idx} className="trick-card-wrapper">
                    <Card card={play.card} disabled={true} />
                    <div className="trick-player-label">{gameState.players[play.playerIndex]?.name}</div>
                  </div>
                ))}
              </div>
              {gameState.state === 'trick_complete' && gameState.lastTrickWinner !== null && (
                <div className="trick-winner-notification">
                  🏆 {gameState.players[gameState.lastTrickWinner]?.name} takes the trick!
                </div>
              )}
            </div>
          )}

          {/* Game Over */}
          {gameState.state === 'finished' && (
            <div className="bidding-panel">
              <h2>Game Over!</h2>
              <div style={{ fontSize: '1.3rem', marginTop: '20px' }}>
                {gameState.scores.map((score, idx) => (
                  <div key={idx} style={{ margin: '10px 0', padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px' }}>
                    {gameState.players[idx]?.name}: {score} points
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '1.8rem', marginTop: '30px', color: 'var(--gold)' }}>
                Winner: {gameState.players[gameState.scores.indexOf(Math.min(...gameState.scores))]?.name}!
                <div style={{ fontSize: '1rem', marginTop: '10px' }}>(Lowest score)</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player Hand */}
      <div className="player-hand-area">
        <div className="hand-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="player-avatar">{currentPlayer.name.charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
                {currentPlayer.name}
                {isMyTurn && <span className="turn-indicator"></span>}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#ddd' }}>
                Score: {gameState.scores[playerIndex]}
                {gameState.currentContract !== 7 && gameState.tricksTaken && ` • Tricks: ${gameState.tricksTaken[playerIndex]}`}
                {gameState.runningScores && gameState.runningScores[playerIndex] > 0 && ` • Round: +${gameState.runningScores[playerIndex]}`}
                {gameState.currentContract === 7 && ` • Passes: ${gameState.loraPasses[playerIndex]}`}
              </div>
            </div>
          </div>
        </div>
        <div className="hand">
          {sortHand(gameState.hand).map((card, idx) => {
            const canPlay = isMyTurn && 
              ((gameState.state === 'playing') || 
               (gameState.state === 'lora_playing' && canPlayLoraCard(card)));
            
            return (
              <div key={idx}>
                <Card 
                  card={card} 
                  onClick={() => canPlay && handlePlayCard(card)}
                  disabled={!canPlay}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Scoreboard Button */}
      <button 
        className="history-button" 
        onClick={() => setShowScoreboard(true)}
        style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          zIndex: 400
        }}
      >
        📊 Scores
      </button>

      {/* Scoreboard Modal */}
      {showScoreboard && (
        <div className="modal" onClick={() => setShowScoreboard(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Lorum Scoreboard</h2>
            <div style={{ marginBottom: '20px' }}>
              <strong>Deal:</strong> {gameState.currentDeal + 1}/28
              {currentContract && (
                <span style={{ marginLeft: '20px' }}>
                  <strong>Contract:</strong> {currentContract.name}
                </span>
              )}
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--gold)' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Player</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Tricks</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Round</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {gameState.players.map((player, idx) => (
                  <tr 
                    key={idx}
                    style={{ 
                      background: idx === playerIndex ? 'rgba(212,175,55,0.2)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    <td style={{ padding: '10px', fontWeight: idx === playerIndex ? 'bold' : 'normal' }}>
                      {player.name}
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px' }}>
                      {gameState.tricksTaken?.[idx] || 0}
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px' }}>
                      {gameState.runningScores?.[idx] > 0 ? `+${gameState.runningScores[idx]}` : '0'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                      {gameState.scores[idx]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {gameState.contractScores && gameState.contractScores.length > 0 && (
              <div>
                <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>Contract History</h3>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {gameState.contractScores.map((contractScore, idx) => (
                    <div 
                      key={idx}
                      style={{ 
                        padding: '8px',
                        background: 'rgba(0,0,0,0.2)',
                        marginBottom: '5px',
                        borderRadius: '4px'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                        Deal {contractScore.deal + 1}: Contract {contractScore.contract}
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>
                        {contractScore.scores.map((score, pIdx) => (
                          <span key={pIdx} style={{ marginRight: '15px' }}>
                            {gameState.players[pIdx].name}: {score > 0 ? '+' : ''}{score}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="close-button" onClick={() => setShowScoreboard(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// MAIN GAME COORDINATOR
// ============================================================================

function GameCoordinator() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [playerIndex, setPlayerIndex] = useState(null);
  const [gameCode, setGameCode] = useState(null);
  const [gameType, setGameType] = useState(null);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (socketRef.current) return;
    const newSocket = io();
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => console.log('Connected'));
    newSocket.on('game_created', ({ gameId, playerIndex: pIdx, gameType: gType }) => {
      setGameCode(gameId);
      setPlayerIndex(pIdx);
      setGameType(gType);
    });
    newSocket.on('game_joined', ({ gameId, playerIndex: pIdx, gameType: gType }) => {
      setGameCode(gameId);
      setPlayerIndex(pIdx);
      setGameType(gType);
    });
    newSocket.on('game_state', (state) => setGameState(state));
    newSocket.on('error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  const handleCreateGame = (playerName, gameConfig) => {
    socket.emit('create_game', { playerName, gameConfig });
  };
  
  const handleJoinGame = (gameId, playerName) => {
    socket.emit('join_game', { gameId, playerName });
  };

  const handleError = (message) => {
    setError(message);
    setTimeout(() => setError(null), 3000);
  };

  // Debug logging
  console.log('GameCoordinator render:', {
    hasGameState: !!gameState,
    gameType,
    gameStateType: gameState?.gameType,
    state: gameState?.state,
    playerIndex,
    playersLength: gameState?.players?.length
  });

  if (!gameState) {
    return <GameSelectionLobby onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} />;
  }

  if (gameState.state === 'waiting') {
    const maxPlayers = gameType === 'lorum' ? 4 : 3;
    return (
      <div className="lobby">
        <h1>{gameType === 'lorum' ? '🃏 Lorum' : '🎴 Mexico'}</h1>
        <div className="game-code">Code: {gameCode}</div>
        <div className="waiting-message">
          Waiting... ({gameState.players.length}/{maxPlayers})
          <br/><br/>
          {gameState.players.map((p, i) => <div key={i}>{i + 1}. {p.name}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      {error && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--red)', color: 'white', padding: '15px 30px',
          borderRadius: '8px', zIndex: 2000, fontWeight: 600
        }}>
          {error}
        </div>
      )}
      
      <Chat socket={socket} gameCode={gameCode} playerIndex={playerIndex} />
      
      {(gameType === 'mexico' || gameState.gameType === 'mexico') && (
        <MexicoGame 
          socket={socket} 
          gameState={gameState} 
          playerIndex={playerIndex} 
          gameCode={gameCode} 
          onError={handleError} 
        />
      )}
      
      {(gameType === 'lorum' || gameState.gameType === 'lorum') && (
        <LorumGame 
          socket={socket} 
          gameState={gameState} 
          playerIndex={playerIndex} 
          gameCode={gameCode} 
          onError={handleError} 
        />
      )}
    </div>
  );
}

ReactDOM.render(<GameCoordinator />, document.getElementById('root'));
