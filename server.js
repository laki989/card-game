const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static('public'));

// Game state
const games = new Map();
const playerSockets = new Map();

// Card deck generation
const SUITS = ['acorns', 'leaves', 'hearts', 'bells'];
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '7': 0, '8': 1, '9': 2, '10': 3, 'J': 4, 'Q': 5, 'K': 6, 'A': 7 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function dealCards(deck) {
  const hands = [[], [], []];
  const talon = [];
  
  // Deal 5 cards to each player
  for (let i = 0; i < 5; i++) {
    hands[0].push(deck.pop());
    hands[1].push(deck.pop());
    hands[2].push(deck.pop());
  }
  
  // 2 cards to talon
  talon.push(deck.pop());
  talon.push(deck.pop());
  
  // Deal remaining 5 cards to each player
  for (let i = 0; i < 5; i++) {
    hands[0].push(deck.pop());
    hands[1].push(deck.pop());
    hands[2].push(deck.pop());
  }
  
  return { hands, talon };
}

function createGame(gameId) {
  return {
    id: gameId,
    players: [],
    state: 'waiting', // waiting, bidding, playing, finished
    deck: [],
    hands: [[], [], []],
    talon: [],
    currentDealer: 0,
    currentPlayer: 0,
    bids: [null, null, null],
    passedPlayers: [false, false, false],
    bidWinner: null,
    trump: null,
    currentTrick: [],
    tricksTaken: [0, 0, 0],
    scores: [0, 0, 0],
    gameHistory: [],
    roundHistory: []
  };
}

function startBidding(game) {
  game.state = 'bidding';
  game.currentPlayer = (game.currentDealer + 1) % 3;
  game.bids = [null, null, null];
  game.passedPlayers = [false, false, false];
  game.bidWinner = null;
  game.trump = null;
  broadcastGameState(game);
}

function startPlaying(game) {
  game.state = 'playing';
  game.currentPlayer = (game.currentDealer + 1) % 3; // Player left of dealer starts
  game.currentTrick = [];
  game.tricksTaken = [0, 0, 0];
  broadcastGameState(game);
}

function handleBid(game, playerIndex, bid) {
  if (game.state !== 'bidding') return { success: false, error: 'Not in bidding phase' };
  if (game.currentPlayer !== playerIndex) return { success: false, error: 'Not your turn' };
  if (game.passedPlayers[playerIndex]) return { success: false, error: 'Already passed' };
  
  const currentHighestBid = Math.max(...game.bids.filter(b => b !== null && b !== 'pass' && b !== 'betl').map(b => b === 'mexico' ? 20 : parseInt(b)), 0);
  const isFirstBid = game.bids.every(b => b === null);
  const isFirstPlayer = playerIndex === (game.currentDealer + 1) % 3;
  
  if (bid === 'pass') {
    // First player (left of dealer) CANNOT pass
    if (isFirstBid && isFirstPlayer) {
      return { success: false, error: 'First player cannot pass - must bid 5 or higher' };
    }
    game.passedPlayers[playerIndex] = true;
    game.bids[playerIndex] = 'pass';
  } else if (bid === 'betl') {
    // Betl can be outbid by 7 or higher
    if (!isFirstBid && currentHighestBid >= 7) {
      return { success: false, error: 'Betl can only be bid if no one has bid 7 or higher' };
    }
    game.bids[playerIndex] = 'betl';
  } else {
    const numericBid = bid === 'mexico' ? 20 : parseInt(bid);
    
    // First player must bid at least 5
    if (isFirstBid && numericBid < 5) {
      return { success: false, error: 'First bid must be at least 5' };
    }
    
    // Others cannot bid 5 (must pass or 6+)
    if (!isFirstBid && numericBid === 5) {
      return { success: false, error: 'Cannot bid 5 after first player - must bid 6 or higher' };
    }
    
    // Handle Betl in current bids
    const hasBetl = game.bids.some(b => b === 'betl');
    if (hasBetl) {
      // Can outbid betl with 7 or higher
      if (numericBid < 7) {
        return { success: false, error: 'Must bid 7 or higher to outbid Betl' };
      }
    } else {
      // Normal bidding - must be higher than current
      if (!isFirstBid && numericBid <= currentHighestBid) {
        return { success: false, error: 'Bid must be higher than current bid' };
      }
    }
    
    game.bids[playerIndex] = bid;
  }
  
  // Check if bidding is over (2 players passed or mexico bid)
  const passCount = game.passedPlayers.filter(p => p).length;
  if (passCount === 2 || bid === 'mexico') {
    // Find bid winner
    let highestBid = -1;
    let winner = -1;
    let isBetl = false;
    
    for (let i = 0; i < 3; i++) {
      const playerBid = game.bids[i];
      if (playerBid && playerBid !== 'pass') {
        if (playerBid === 'betl') {
          isBetl = true;
          winner = i;
          break;
        }
        const numericBid = playerBid === 'mexico' ? 20 : parseInt(playerBid);
        if (numericBid > highestBid) {
          highestBid = numericBid;
          winner = i;
        }
      }
    }
    
    game.bidWinner = winner;
    game.isBetl = isBetl;
    
    if (bid === 'mexico') {
      // Mexico: no talon, no trump, start playing
      game.trump = null;
      startPlaying(game);
    } else if (isBetl) {
      // Betl: no talon, no trump, start playing
      game.trump = null;
      startPlaying(game);
    } else {
      // Show talon and wait for trump selection
      game.state = 'talon_reveal';
      broadcastGameState(game);
    }
  } else {
    // Move to next player
    game.currentPlayer = (game.currentPlayer + 1) % 3;
    broadcastGameState(game);
  }
  
  return { success: true };
}

function handleTalonTake(game, playerIndex, discards) {
  if (game.state !== 'talon_reveal') return { success: false, error: 'Not in talon phase' };
  if (playerIndex !== game.bidWinner) return { success: false, error: 'Only bid winner can take talon' };
  
  // Must discard exactly 2 cards (can be talon cards or original cards)
  if (discards.length !== 2) return { success: false, error: 'Must discard exactly 2 cards' };
  
  // Add talon to winner's hand permanently (they already saw it in their hand)
  game.hands[playerIndex].push(...game.talon);
  
  // Remove the 2 discarded cards
  for (const card of discards) {
    const index = game.hands[playerIndex].findIndex(c => 
      c.suit === card.suit && c.rank === card.rank
    );
    if (index === -1) return { success: false, error: 'Invalid discard - card not in hand' };
    game.hands[playerIndex].splice(index, 1);
  }
  
  // Should now have exactly 10 cards
  if (game.hands[playerIndex].length !== 10) {
    console.error(`Player ${playerIndex} has ${game.hands[playerIndex].length} cards after talon, expected 10`);
    return { success: false, error: 'Error: incorrect number of cards after discard' };
  }
  
  game.state = 'trump_selection';
  broadcastGameState(game);
  return { success: true };
}

function handleTrumpSelection(game, playerIndex, trump) {
  if (game.state !== 'trump_selection') return { success: false, error: 'Not in trump selection phase' };
  if (playerIndex !== game.bidWinner) return { success: false, error: 'Only bid winner can select trump' };
  if (!SUITS.includes(trump)) return { success: false, error: 'Invalid trump suit' };
  
  game.trump = trump;
  startPlaying(game);
  return { success: true };
}

function canPlayCard(game, playerIndex, card) {
  if (game.currentTrick.length === 0) return true; // Can play any card when leading
  
  const leadCard = game.currentTrick[0].card;
  const playerHand = game.hands[playerIndex];
  
  // Must follow suit if possible
  if (card.suit === leadCard.suit) return true;
  
  const hasSuit = playerHand.some(c => c.suit === leadCard.suit);
  if (hasSuit) return false; // Must follow suit
  
  // If can't follow suit, must play trump if possible
  if (game.trump && card.suit === game.trump) return true;
  
  const hasTrump = game.trump && playerHand.some(c => c.suit === game.trump);
  if (hasTrump) return false; // Must play trump
  
  // If no suit and no trump, can play any card
  return true;
}

function determineWinner(trick, trump) {
  let winningIndex = 0;
  let winningCard = trick[0].card;
  
  console.log('Determining winner. Trump:', trump);
  console.log('Trick:', trick.map(t => `${t.card.rank} of ${t.card.suit}`).join(', '));
  
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i].card;
    
    // Trump beats non-trump
    if (trump && card.suit === trump && winningCard.suit !== trump) {
      console.log(`  Card ${i} (${card.rank} of ${card.suit}) is trump, beats ${winningCard.rank} of ${winningCard.suit}`);
      winningIndex = i;
      winningCard = card;
      continue;
    }
    
    // Non-trump can't beat trump
    if (trump && winningCard.suit === trump && card.suit !== trump) {
      console.log(`  Card ${i} (${card.rank} of ${card.suit}) can't beat trump ${winningCard.rank} of ${winningCard.suit}`);
      continue;
    }
    
    // Same suit: higher rank wins
    if (card.suit === winningCard.suit) {
      if (RANK_VALUES[card.rank] > RANK_VALUES[winningCard.rank]) {
        console.log(`  Card ${i} (${card.rank} of ${card.suit}) beats ${winningCard.rank} of same suit`);
        winningIndex = i;
        winningCard = card;
      }
    }
  }
  
  console.log(`Winner: Player ${trick[winningIndex].playerIndex} with ${winningCard.rank} of ${winningCard.suit}`);
  return trick[winningIndex].playerIndex;
}

function handlePlayCard(game, playerIndex, card) {
  if (game.state !== 'playing') return { success: false, error: 'Not in playing phase' };
  if (game.currentPlayer !== playerIndex) return { success: false, error: 'Not your turn' };
  
  // Verify player has the card
  const cardIndex = game.hands[playerIndex].findIndex(c => 
    c.suit === card.suit && c.rank === card.rank
  );
  if (cardIndex === -1) return { success: false, error: 'Card not in hand' };
  
  // Verify card can be played
  if (!canPlayCard(game, playerIndex, card)) {
    return { success: false, error: 'Cannot play this card (must follow suit or play trump)' };
  }
  
  // Remove card from hand
  game.hands[playerIndex].splice(cardIndex, 1);
  
  // Add to current trick
  game.currentTrick.push({ playerIndex, card });
  
  if (game.currentTrick.length === 3) {
    // Trick complete - determine winner
    const winner = determineWinner(game.currentTrick, game.trump);
    game.tricksTaken[winner]++;
    
    // Add to round history
    game.roundHistory.push({
      trick: [...game.currentTrick],
      winner: winner
    });
    
    // Show completed trick with winner for 3 seconds
    game.state = 'trick_complete';
    game.lastTrickWinner = winner;
    broadcastGameState(game);
    
    // Wait 3 seconds before continuing
    setTimeout(() => {
      // Check if round is over
      if (game.hands[0].length === 0) {
        endRound(game);
      } else {
        // Next trick
        game.state = 'playing';
        game.currentTrick = [];
        game.currentPlayer = winner;
        game.lastTrickWinner = null;
        broadcastGameState(game);
      }
    }, 3000);
  } else {
    // Move to next player
    game.currentPlayer = (game.currentPlayer + 1) % 3;
    broadcastGameState(game);
  }
  
  return { success: true };
}

function endRound(game) {
  const bidWinner = game.bidWinner;
  const bidValue = game.bids[bidWinner];
  const tricksTaken = game.tricksTaken[bidWinner];
  
  // Calculate scores
  const roundScores = [0, 0, 0];
  
  if (game.isBetl) {
    // Betl scoring: must take 0 tricks
    if (tricksTaken === 0) {
      // Betl succeeded: caller gets +7, others get 0
      roundScores[bidWinner] = 7;
      // Others get 0
    } else {
      // Betl failed: caller gets -7, others get their tricks
      roundScores[bidWinner] = -7;
      for (let i = 0; i < 3; i++) {
        if (i !== bidWinner) {
          roundScores[i] = game.tricksTaken[i];
        }
      }
    }
  } else {
    // Normal scoring
    const numericBid = bidValue === 'mexico' ? 10 : parseInt(bidValue);
    
    if (tricksTaken >= numericBid) {
      // Bid winner succeeded
      roundScores[bidWinner] = tricksTaken;
    } else {
      // Bid winner failed
      roundScores[bidWinner] = -numericBid;
    }
    
    // Other players always score their tricks
    for (let i = 0; i < 3; i++) {
      if (i !== bidWinner) {
        roundScores[i] = game.tricksTaken[i];
      }
    }
  }
  
  // Update total scores
  for (let i = 0; i < 3; i++) {
    game.scores[i] += roundScores[i];
  }
  
  // Add to game history
  game.gameHistory.push({
    dealer: game.currentDealer,
    bids: [...game.bids],
    bidWinner: bidWinner,
    trump: game.trump,
    isBetl: game.isBetl,
    tricksTaken: [...game.tricksTaken],
    roundScores: roundScores,
    totalScores: [...game.scores],
    rounds: [...game.roundHistory]
  });
  
  // Check for winner
  if (game.scores.some(s => s >= 101)) {
    game.state = 'finished';
    broadcastGameState(game);
  } else {
    // Next round
    game.currentDealer = (game.currentDealer + 1) % 3;
    game.roundHistory = [];
    startNewRound(game);
  }
}

function startNewRound(game) {
  const deck = shuffleDeck(createDeck());
  const { hands, talon } = dealCards(deck);
  
  game.hands = hands;
  game.talon = talon;
  game.bids = [null, null, null];
  game.passedPlayers = [false, false, false];
  game.bidWinner = null;
  game.trump = null;
  game.isBetl = false;
  game.currentTrick = [];
  game.tricksTaken = [0, 0, 0];
  
  startBidding(game);
}

function broadcastGameState(game) {
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    const socket = playerSockets.get(player.id);
    if (socket) {
      socket.emit('game_state', getPlayerGameState(game, i));
    }
  }
}

function getPlayerGameState(game, playerIndex) {
  // For talon reveal phase, include talon cards in the bid winner's hand
  let playerHand = game.hands[playerIndex] || [];
  if (game.state === 'talon_reveal' && playerIndex === game.bidWinner && game.talon) {
    playerHand = [...playerHand, ...game.talon];
  }
  
  return {
    gameId: game.id,
    players: game.players.map(p => ({ name: p.name, id: p.id })),
    playerIndex: playerIndex,
    state: game.state,
    currentDealer: game.currentDealer,
    currentPlayer: game.currentPlayer,
    hand: playerHand,
    talon: game.state === 'talon_reveal' || game.state === 'trump_selection' ? game.talon : null,
    bids: game.bids,
    passedPlayers: game.passedPlayers,
    bidWinner: game.bidWinner,
    trump: game.trump,
    currentTrick: game.currentTrick,
    tricksTaken: game.tricksTaken,
    scores: game.scores,
    gameHistory: game.gameHistory,
    lastTrickWinner: game.lastTrickWinner || null
  };
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('create_game', ({ playerName }) => {
    console.log('Creating game for player:', playerName, 'Socket:', socket.id);
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = createGame(gameId);
    game.players.push({ id: socket.id, name: playerName });
    games.set(gameId, game);
    playerSockets.set(socket.id, socket);
    
    socket.join(gameId);
    console.log('Game created:', gameId);
    socket.emit('game_created', { gameId, playerIndex: 0 });
    socket.emit('game_state', getPlayerGameState(game, 0));
  });
  
  socket.on('join_game', ({ gameId, playerName }) => {
    console.log('Player joining game:', playerName, 'Game:', gameId, 'Socket:', socket.id);
    const game = games.get(gameId);
    if (!game) {
      console.log('Game not found:', gameId);
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (game.players.length >= 3) {
      console.log('Game is full:', gameId);
      socket.emit('error', { message: 'Game is full' });
      return;
    }
    
    const playerIndex = game.players.length;
    game.players.push({ id: socket.id, name: playerName });
    playerSockets.set(socket.id, socket);
    
    socket.join(gameId);
    console.log('Player joined game:', gameId, 'Player count:', game.players.length);
    socket.emit('game_joined', { gameId, playerIndex });
    
    // If game is now full, start the game
    if (game.players.length === 3) {
      console.log('Game full, starting round:', gameId);
      startNewRound(game);
    } else {
      broadcastGameState(game);
    }
  });
  
  socket.on('bid', ({ gameId, bid }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const result = handleBid(game, playerIndex, bid);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    }
  });
  
  socket.on('take_talon', ({ gameId, discards }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const result = handleTalonTake(game, playerIndex, discards);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    }
  });
  
  socket.on('select_trump', ({ gameId, trump }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const result = handleTrumpSelection(game, playerIndex, trump);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    }
  });
  
  socket.on('play_card', ({ gameId, card }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const result = handlePlayCard(game, playerIndex, card);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    }
  });
  
  socket.on('reset_game', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    console.log('Resetting game:', gameId);
    
    // Reset scores and history
    game.scores = [0, 0, 0];
    game.gameHistory = [];
    game.currentDealer = 0;
    
    // Start new round
    startNewRound(game);
  });
  
  socket.on('chat_message', ({ gameId, message }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const playerName = game.players[playerIndex].name;
    const timestamp = Date.now();
    
    // Broadcast chat message to all players in the game
    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      const playerSocket = playerSockets.get(player.id);
      if (playerSocket) {
        playerSocket.emit('chat_message', {
          playerName,
          playerIndex,
          message,
          timestamp
        });
      }
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Player disconnected:', socket.id, 'Reason:', reason);
    playerSockets.delete(socket.id);
    
    // Find and clean up games with this player
    for (const [gameId, game] of games.entries()) {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        console.log(`Player ${playerIndex} left game ${gameId}`);
        // Notify other players
        io.to(gameId).emit('player_left', { playerIndex });
        // Could implement reconnection logic here
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
