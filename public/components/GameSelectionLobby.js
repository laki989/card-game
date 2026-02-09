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
