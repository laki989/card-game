const { useState, useEffect, useRef } = React;

// Constants
const SUIT_SYMBOLS = {
  'acorns': '🌰',
  'leaves': '🍃',
  'hearts': '♥️',
  'bells': '🔔'
};

const RANK_ORDER = { 'A': 7, 'K': 6, 'Q': 5, 'J': 4, '10': 3, '9': 2, '8': 1, '7': 0 };
const SUIT_ORDER = ['hearts', 'bells', 'leaves', 'acorns'];

// Helper Functions
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

// Card Component
function Card({ card, onClick, disabled }) {
  return (
    <div className={`card ${disabled ? 'disabled' : ''}`} onClick={disabled ? undefined : onClick}>
      <img src={getCardImagePath(card)} alt={`${card.rank} of ${card.suit}`} />
    </div>
  );
}

// Game History Modal
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
              {round.trump && <p><strong>Trump:</strong> {SUIT_SYMBOLS[round.trump]}</p>}
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

// Lobby Component
function Lobby({ onCreateGame, onJoinGame }) {
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  return (
    <div className="lobby">
      <h1>🃏 Mexico</h1>
      <input type="text" placeholder="Enter your name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
      <div className="lobby-buttons">
        <button onClick={() => playerName && onCreateGame(playerName)} disabled={!playerName}>Create New Game</button>
        <button onClick={() => setShowJoin(!showJoin)}>{showJoin ? 'Cancel' : 'Join Existing Game'}</button>
        {showJoin && (
          <>
            <input type="text" placeholder="Enter game code" value={gameCode} onChange={(e) => setGameCode(e.target.value.toUpperCase())} />
            <button onClick={() => playerName && gameCode && onJoinGame(gameCode, playerName)} disabled={!playerName || !gameCode}>Join Game</button>
          </>
        )}
      </div>
    </div>
  );
}

// Chat Component
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

    return () => {
      socket.off('chat_message');
    };
  }, [socket]);

  // Auto-scroll to bottom when new message arrives
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
    if (e.key === 'Enter') {
      sendMessage();
    }
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
            <button 
              className="chat-send-button" 
              onClick={sendMessage}
              disabled={!inputMessage.trim()}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Main Game Component
function Game() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [playerIndex, setPlayerIndex] = useState(null);
  const [gameCode, setGameCode] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDiscards, setSelectedDiscards] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const socketRef = useRef(null);

  // Socket Connection
  useEffect(() => {
    if (socketRef.current) {
      console.log('Socket already exists');
      return;
    }

    console.log('Initializing socket...');
    const newSocket = io();
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => console.log('Connected:', newSocket.id));
    newSocket.on('game_created', ({ gameId, playerIndex: pIdx }) => {
      console.log('Game created:', gameId);
      setGameCode(gameId);
      setPlayerIndex(pIdx);
    });
    newSocket.on('game_joined', ({ gameId, playerIndex: pIdx }) => {
      console.log('Game joined:', gameId);
      setGameCode(gameId);
      setPlayerIndex(pIdx);
    });
    newSocket.on('game_state', (state) => {
      console.log('State updated:', state.state);
      setGameState(state);
      setSelectedDiscards([]);
    });
    newSocket.on('error', ({ message }) => {
      console.error('Error:', message);
      setError(message);
      setTimeout(() => setError(null), 3000);
    });
    newSocket.on('player_left', ({ playerIndex }) => {
      alert(`Player ${playerIndex + 1} left`);
    });
    newSocket.on('disconnect', (reason) => console.log('Disconnected:', reason));

    return () => {
      console.log('Cleanup');
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  // Event Handlers
  const handleCreateGame = (name) => socket.emit('create_game', { playerName: name });
  const handleJoinGame = (id, name) => socket.emit('join_game', { gameId: id, playerName: name });
  const handleBid = (bid) => socket.emit('bid', { gameId: gameCode, bid });
  const handlePlayCard = (card) => {
    if (gameState.state !== 'playing' || gameState.currentPlayer !== playerIndex) return;
    socket.emit('play_card', { gameId: gameCode, card });
  };
  const handleTalonTake = () => {
    if (selectedDiscards.length !== 2) {
      setError('Select exactly 2 cards');
      setTimeout(() => setError(null), 3000);
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
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
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

  // Render Lobby
  if (!gameState) {
    return <Lobby onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} />;
  }

  // Waiting Room
  if (gameState.state === 'waiting') {
    return (
      <div className="lobby">
        <h1>🃏 Mexico</h1>
        <div className="game-code">Code: {gameCode}</div>
        <div className="waiting-message">
          Waiting... ({gameState.players.length}/3)
          <br/><br/>
          {gameState.players.map((p, i) => <div key={i}>{i + 1}. {p.name}</div>)}
        </div>
      </div>
    );
  }

  // Safety Checks
  if (!gameState.players || gameState.players.length < 3 || playerIndex === null ||
      !gameState.bids || !gameState.tricksTaken || !gameState.scores || !gameState.passedPlayers) {
    return <div className="waiting-message">Loading...</div>;
  }

  const currentPlayer = gameState.players[playerIndex];
  const otherPlayers = gameState.players.filter((_, i) => i !== playerIndex);
  if (!currentPlayer || otherPlayers.length !== 2) {
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
    <div className="game-container">
      {/* Error Toast */}
      {error && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--red)', color: 'white', padding: '15px 30px',
          borderRadius: '8px', zIndex: 2000, fontWeight: 600
        }}>
          {error}
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <GameHistory history={gameState.gameHistory} players={gameState.players} onClose={() => setShowHistory(false)} />
      )}

      {/* Chat Panel */}
      <Chat socket={socket} gameCode={gameCode} playerIndex={playerIndex} />

      {/* Header */}
      <div className="game-header">
        <div className="game-info">
          <div className="game-info-item"><span>Game: {gameCode}</span></div>
          {gameState.trump && (
            <div className="game-info-item">
              <span>Trump:</span>
              <div className="trump-indicator">{SUIT_SYMBOLS[gameState.trump]}</div>
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
                  {Object.entries(SUIT_SYMBOLS).map(([suit, symbol]) => (
                    <button key={suit} className="trump-button" onClick={() => handleSelectTrump(suit)}>
                      {symbol}
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
                {isSelected && (
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
    </div>
  );
}

// Render
ReactDOM.render(<Game />, document.getElementById('root'));
