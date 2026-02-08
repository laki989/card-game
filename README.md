# Card Game - Online Multiplayer

A real-time multiplayer card game for 3 players, built with Node.js, WebSockets, and React.

## Features

✅ **Core Game Mechanics**
- Full implementation of Šnops rules
- Bidding system (5-10 and Mexico)
- Talon reveal and discard
- Trump selection
- Trick-taking with proper suit/trump rules
- Scoring system (first to 101 wins)

✅ **Multiplayer**
- Real-time gameplay via WebSockets
- Create and join games with game codes
- 3-player support

✅ **UI Features**
- German-suited cards (Acorns, Leaves, Hearts, Bells)
- Classic forest/tavern aesthetic
- Game history viewer
- Visual turn indicators
- Score tracking
- Trick display

## Setup & Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation Steps

1. **Install dependencies:**
```bash
npm install
```

2. **Start the server:**
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

3. **Open the game:**
Open your browser and navigate to:
```
http://localhost:3000
```

## How to Play

### Starting a Game

1. **Player 1**: 
   - Enter your name
   - Click "Create New Game"
   - Share the game code with other players

2. **Players 2 & 3**:
   - Enter your name
   - Click "Join Existing Game"
   - Enter the game code
   - Click "Join Game"

3. Game starts automatically when all 3 players join

### Game Flow

1. **Bidding Phase**
   - First player (after dealer) must bid at least 5
   - Each player can bid higher or pass
   - Bidding ends when 2 players pass or someone bids Mexico

2. **Talon Phase** (if not Mexico)
   - Bid winner sees 2 talon cards
   - Adds them to hand
   - Discards 2 cards
   - Selects trump suit

3. **Playing Phase**
   - Bid winner leads first trick
   - Must follow suit if possible
   - Must play trump if can't follow suit
   - Highest card in led suit wins (trump beats all)
   - Winner of trick leads next

4. **Scoring**
   - Bid winner: +tricks if successful, -bid value if failed
   - Other players: always +tricks taken
   - First to 101 points wins

### Game Rules

**Card Ranks** (lowest to highest):
7, 8, 9, 10, J, Q, K, A

**Suits:**
- 🌰 Acorns (Eichel)
- 🍃 Leaves (Grün)
- ♥️ Hearts (Herz)
- 🔔 Bells (Schellen)

**Special Bids:**
- **Mexico (20)**: Must take all 10 tricks, no trump, no talon

## Testing Locally

You can test the game alone by opening 3 browser windows:

1. Window 1: Create game, get game code
2. Window 2: Join with game code
3. Window 3: Join with same game code

All windows will sync in real-time!

## Architecture

### Backend (server.js)
- Express.js web server
- Socket.IO for WebSocket communication
- Game state management
- Card dealing and shuffling
- Rule enforcement
- Scoring logic

### Frontend (public/index.html)
- React (via CDN)
- Socket.IO client
- German card graphics using Unicode symbols
- Real-time state synchronization
- Responsive layout

## File Structure

```
snops-card-game/
├── server.js           # Node.js backend
├── public/
│   └── index.html      # React frontend (all-in-one)
├── package.json        # Dependencies
└── README.md          # This file
```

## Future Enhancements

Planned features:
- [ ] Chat system
- [ ] Player statistics
- [ ] Reconnection handling
- [ ] Multiple game rooms
- [ ] User accounts/authentication
- [ ] Game replay viewer
- [ ] Sound effects
- [ ] Mobile optimization

## Technical Details

**Network Protocol:**
- `create_game`: Create new game room
- `join_game`: Join existing game
- `bid`: Submit bid or pass
- `take_talon`: Take talon and discard cards
- `select_trump`: Choose trump suit
- `play_card`: Play a card from hand
- `game_state`: Receive updated game state

**Game States:**
- `waiting`: Waiting for players
- `bidding`: Bidding phase
- `talon_reveal`: Showing talon to bid winner
- `trump_selection`: Bid winner selecting trump
- `playing`: Playing tricks
- `finished`: Game complete

## Troubleshooting

**Port already in use:**
```bash
# Change port in server.js (line at bottom)
const PORT = process.env.PORT || 3001;
```

**Can't connect:**
- Ensure server is running (`npm start`)
- Check console for errors
- Verify you're using `http://localhost:3000`

**Game not starting:**
- Need exactly 3 players
- Each player must join with unique name
- Check browser console for errors

## License

MIT

## Credits
