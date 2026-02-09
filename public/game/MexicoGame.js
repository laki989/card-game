// MexicoGame.js - 3-player Mexico card game component

function MexicoGame({ socket, gameState, playerIndex, gameCode, onError }) {
  const [selectedDiscards, setSelectedDiscards] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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
    </>
  );
}
