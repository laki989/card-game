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
                  {gameState.currentContract === 7 && ` (Passes: ${gameState.loraPasses[playerIdx]})`}
                </div>
              </div>
            </div>
            {gameState.hand && gameState.hand.length > 0 && (
              <div className="opponent-cards">
                {[...Array(Math.min(8, gameState.hands[playerIdx]?.length || 8))].map((_, i) => (
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
                {playerIndex === gameState.currentDealer ? 'You are the dealer - choose a contract:' : `Waiting for ${gameState.players[gameState.currentDealer]?.name} to choose...`}
              </p>
              {playerIndex === gameState.currentDealer && (
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
                      {SUIT_SYMBOLS[suit]}
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
          {gameState.state === 'playing' && (
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

      {/* Scoreboard Overlay */}
      <div className="lorum-scoreboard">
        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '10px' }}>
          Scores:
        </div>
        {gameState.players.map((player, idx) => (
          <div key={idx} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '5px 10px',
            background: idx === playerIndex ? 'rgba(212,175,55,0.2)' : 'transparent',
            borderRadius: '4px'
          }}>
            <span>{player.name}</span>
            <span style={{ fontWeight: 'bold' }}>{gameState.scores[idx]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// Helper function
function getNextRank(rank) {
  const sequence = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const index = sequence.indexOf(rank);
  return sequence[(index + 1) % 8];
}
