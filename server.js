const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// How long a finished trick stays on the table (ms)
const TRICK_DELAY = Number(process.env.TRICK_DELAY_MS) || 3000;

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
    gameType: 'mexico',
    players: [],
    state: 'lobby', // lobby, bidding, talon_reveal, trump_selection, playing, trick_complete, finished, abandoned
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
  
  // Must discard exactly 2 different cards (can be talon cards or original cards)
  if (!Array.isArray(discards) || discards.length !== 2) return { success: false, error: 'Must discard exactly 2 cards' };
  if (discards[0].suit === discards[1].suit && discards[0].rank === discards[1].rank) {
    return { success: false, error: 'Pick 2 different cards' };
  }

  // Work on a copy so a rejected request leaves the hand untouched
  const newHand = [...game.hands[playerIndex], ...game.talon];
  for (const card of discards) {
    const index = newHand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (index === -1) return { success: false, error: 'Invalid discard - card not in hand' };
    newHand.splice(index, 1);
  }
  if (newHand.length !== 10) {
    console.error(`Player ${playerIndex} would have ${newHand.length} cards after talon, expected 10`);
    return { success: false, error: 'Error: incorrect number of cards after discard' };
  }

  game.hands[playerIndex] = newHand;
  game.talon = [];
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
    }, TRICK_DELAY);
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
  
  // Base state for all games
  const baseState = {
    gameId: game.id,
    gameType: game.gameType,
    players: game.players.map(p => ({ name: p.name, ready: !!p.ready, connected: p.connected !== false })),
    playerIndex: playerIndex,
    hostIndex: 0,
    maxPlayers: maxPlayersFor(game),
    leftPlayer: game.leftPlayer || null,
    handCounts: game.hands.map(h => h.length),
    state: game.state,
    currentDealer: game.currentDealer,
    currentPlayer: game.currentPlayer,
    hand: playerHand,
    scores: game.scores
  };
  
  // Add game-specific data
  if (game.gameType === 'lorum') {
    // Lorum-specific data
    return {
      ...baseState,
      currentDeal: game.currentDeal,
      currentContract: game.currentContract,
      contractMode: game.contractMode,
      contractSelector: game.contractSelector,
      usedContracts: game.usedContracts,
      currentTrick: game.currentTrick,
      tricksTaken: game.tricksTaken,
      queensTaken: game.queensTaken,
      heartsTaken: game.heartsTaken,
      hasJackOfClubs: game.hasJackOfClubs,
      hasKingOfHearts: game.hasKingOfHearts,
      lastTrickWinner: game.lastTrickWinner ?? null,
      runningScores: game.runningScores || [0, 0, 0, 0],
      loraLayout: game.loraLayout,
      loraStartRank: game.loraStartRank,
      loraPasses: game.loraPasses,
      loraClosed: game.loraClosed,
      dealOver: game.state === 'trick_complete' && require('./lorumGame').goalReached(game),
      contractScores: game.contractScores,
      gameHistory: game.gameHistory
    };
  } else {
    // Mexico-specific data
    return {
      ...baseState,
      talon: game.state === 'talon_reveal' || game.state === 'trump_selection' ? game.talon : null,
      bids: game.bids,
      passedPlayers: game.passedPlayers,
      bidWinner: game.bidWinner,
      trump: game.trump,
      currentTrick: game.currentTrick,
      tricksTaken: game.tricksTaken,
      gameHistory: game.gameHistory,
      lastTrickWinner: game.lastTrickWinner ?? null
    };
  }
}


function maxPlayersFor(game) {
  return game.gameType === 'lorum' ? 4 : 3;
}

function playerIndexOf(game, socketId) {
  return game.players.findIndex(p => p.id === socketId);
}

// How long a dropped player's seat is held so they can come back (ms).
// Same browser, same token: the page rejoins automatically.
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 120000;
const graceTimers = new Map(); // token -> timeout

function clearGrace(token) {
  const t = graceTimers.get(token);
  if (t) { clearTimeout(t); graceTimers.delete(token); }
}

function startGrace(game, token) {
  clearGrace(token);
  const timer = setTimeout(() => {
    graceTimers.delete(token);
    const idx = game.players.findIndex(p => p.token === token);
    if (idx === -1 || game.players[idx].connected) return;
    if (games.get(game.id) !== game) return;
    console.log('Reconnect window expired:', game.id, game.players[idx].name);
    removeSeat(game, idx);
  }, RECONNECT_GRACE_MS);
  graceTimers.set(token, timer);
}

// Forget a table completely, including any seats still waiting to reconnect
function dropGame(game) {
  for (const p of game.players) clearGrace(p.token);
  games.delete(game.id);
  publishLobby();
}

// Give up a seat for good. In the lobby it simply frees up (the next player
// becomes host if the host left). Once cards are dealt, the table can't
// continue, so it's closed for everyone.
function removeSeat(game, idx) {
  const p = game.players[idx];
  const sock = p.id ? playerSockets.get(p.id) : null;
  if (sock) sock.leave(game.id);
  clearGrace(p.token);

  if (game.state === 'lobby') {
    game.players.splice(idx, 1);
    // Anyone who was ready stays ready; the host never needs to be
    if (game.players[0]) game.players[0].ready = true;
    if (game.players.length === 0) {
      dropGame(game);
      console.log('Lobby closed (empty):', game.id);
      return;
    }
    broadcastGameState(game);
    publishLobby();
  } else if (game.state !== 'abandoned') {
    game.players.splice(idx, 1);
    game.state = 'abandoned';
    game.leftPlayer = p.name;
    broadcastGameState(game);
    dropGame(game);
    console.log('Game closed, player left mid-game:', game.id, p.name);
  }
}

// Explicit "Leave table": the seat is released right away
function leaveGame(game, socketId) {
  const idx = playerIndexOf(game, socketId);
  if (idx !== -1) removeSeat(game, idx);
}

// ---------- Open-table list and table passwords ----------

const cleanName = n => String(n || '').trim().slice(0, 20) || 'Player';
const seatedAnywhere = socketId => [...games.values()].some(g => playerIndexOf(g, socketId) !== -1);

// Table passwords are kept only as salted scrypt hashes
function hashPassword(pw) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(pw, salt, 32, { N: 4096 }, (err, key) => (err ? reject(err) : resolve({ salt, key })));
  });
}
function checkPassword(pw, stored) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pw, stored.salt, 32, { N: 4096 }, (err, key) => (err ? reject(err) : resolve(crypto.timingSafeEqual(key, stored.key))));
  });
}

// Wrong passwords per address: 5 misses, then a one-minute pause
const MAX_MISSES = 5;
const LOCKOUT_MS = 60000;
const failedJoins = new Map(); // ip -> { count, until, last }
function clientIp(socket) {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0].trim() : socket.handshake.address) || 'unknown';
}
function lockedOut(ip) {
  const f = failedJoins.get(ip);
  return !!f && f.until > Date.now();
}
function noteMiss(ip) {
  const f = failedJoins.get(ip) || { count: 0, until: 0, last: 0 };
  if (f.until && f.until <= Date.now()) { f.count = 0; f.until = 0; }
  f.count++;
  f.last = Date.now();
  if (f.count >= MAX_MISSES) f.until = Date.now() + LOCKOUT_MS;
  failedJoins.set(ip, f);
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60000;
  for (const [ip, f] of failedJoins) if (f.last < cutoff) failedJoins.delete(ip);
}, 5 * 60000).unref();

// Tables someone can still sit down at, newest first. Sent only to
// clients on the start screen, and only when the list actually changes.
const LOBBY_ROOM = 'browse';
function openTables() {
  const list = [];
  for (const game of games.values()) {
    if (game.state !== 'lobby') continue;
    const host = game.players[0];
    if (!host || host.connected === false) continue;
    const max = maxPlayersFor(game);
    if (game.players.length >= max) continue;
    list.push({
      id: game.id,
      gameType: game.gameType,
      host: host.name,
      seats: game.players.length,
      max,
      locked: !!game.password,
      mode: game.gameType === 'lorum' ? (game.contractMode || 'fixed') : null
    });
  }
  return list.reverse().slice(0, 50);
}
let lastPublished = '';
let publishTimer = null;
function publishLobby() {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    const list = openTables();
    const json = JSON.stringify(list);
    if (json === lastPublished) return;
    lastPublished = json;
    io.to(LOBBY_ROOM).emit('lobby_list', list);
  }, 120);
}

function startGame(game) {
  publishLobby();
  if (game.gameType === 'lorum') {
    const lorumGame = require('./lorumGame');
    lorumGame.startLorumDeal(game);
    broadcastGameState(game);
  } else {
    startNewRound(game);
  }
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log('✅ Player connected:', socket.id);
  console.log('📊 Active connections:', io.sockets.sockets.size);
  
  // Acknowledge connection
  socket.emit('connection_ack', { message: 'Connected successfully', socketId: socket.id });
  
  socket.on('lobby_subscribe', () => {
    socket.join(LOBBY_ROOM);
    socket.emit('lobby_list', openTables());
  });
  socket.on('lobby_unsubscribe', () => socket.leave(LOBBY_ROOM));

  socket.on('create_game', async ({ playerName, gameConfig } = {}) => {
    const busy = () => {
      if (!seatedAnywhere(socket.id)) return false;
      socket.emit('error', { message: 'Leave your current table first' });
      return true;
    };
    if (busy()) return;

    // Optional table password, kept only as a hash
    const pw = String(gameConfig?.password || '').trim().slice(0, 32);
    let stored = null;
    if (pw) {
      try { stored = await hashPassword(pw); } catch (e) {
        socket.emit('error', { message: 'Could not create the table' });
        return;
      }
      if (busy()) return;
    }

    let gameId;
    do { gameId = Math.random().toString(36).substring(2, 8).toUpperCase(); } while (games.has(gameId) || gameId.length < 6);

    // Determine game type (default to mexico for backward compatibility)
    const gameType = gameConfig?.gameType || 'mexico';
    console.log('Creating game for player:', playerName, 'Type:', gameType, stored ? '(password)' : '');

    let game;
    if (gameType === 'lorum') {
      const lorumGame = require('./lorumGame');
      game = lorumGame.createLorumGame(gameId, gameConfig?.contractMode || 'fixed');
    } else {
      game = createGame(gameId);
    }
    game.password = stored;

    const token = crypto.randomUUID();
    game.players.push({ id: socket.id, token, name: cleanName(playerName), ready: true, connected: true });
    games.set(gameId, game);
    playerSockets.set(socket.id, socket);

    socket.join(gameId);
    console.log('Game created:', gameId, 'Type:', gameType);
    socket.emit('game_created', { gameId, playerIndex: 0, gameType, token });
    socket.emit('game_state', getPlayerGameState(game, 0));
    publishLobby();
  });

  socket.on('join_game', async ({ gameId, playerName, password } = {}) => {
    const code = String(gameId || '').trim().toUpperCase();
    // Why this table can't be joined right now, or null
    const problem = () => {
      const g = games.get(code);
      if (!g) return 'No table with that code';
      if (g.state !== 'lobby') return 'That game has already started';
      if (g.players.length >= maxPlayersFor(g)) return 'That table is full';
      if (seatedAnywhere(socket.id)) return 'Leave your current table first';
      return null;
    };
    let err = problem();
    if (err) { socket.emit('error', { message: err }); return; }

    const locked = games.get(code).password;
    if (locked) {
      const pw = String(password || '').trim().slice(0, 32);
      if (!pw) { socket.emit('join_denied', { gameId: code, reason: 'password_required' }); return; }
      const ip = clientIp(socket);
      if (lockedOut(ip)) {
        socket.emit('error', { message: 'Too many wrong passwords. Try again in a minute' });
        return;
      }
      let ok = false;
      try { ok = await checkPassword(pw, locked); } catch (e) { ok = false; }
      if (!ok) {
        noteMiss(ip);
        socket.emit('join_denied', { gameId: code, reason: 'wrong_password' });
        return;
      }
      failedJoins.delete(ip);
      // The table may have changed while the password was being checked
      err = problem();
      if (err) { socket.emit('error', { message: err }); return; }
    }

    const game = games.get(code);
    const playerIndex = game.players.length;
    const token = crypto.randomUUID();
    game.players.push({ id: socket.id, token, name: cleanName(playerName), ready: false, connected: true });
    playerSockets.set(socket.id, socket);
    socket.join(code);
    console.log('Player joined lobby:', code, `${game.players.length}/${maxPlayersFor(game)}`);
    socket.emit('game_joined', { gameId: code, playerIndex, gameType: game.gameType, token });
    broadcastGameState(game);
    publishLobby();
  });

  socket.on('set_ready', ({ gameId, ready }) => {
    const game = games.get(gameId);
    if (!game || game.state !== 'lobby') return;
    const idx = playerIndexOf(game, socket.id);
    if (idx <= 0) return; // host is always ready
    game.players[idx].ready = !!ready;
    broadcastGameState(game);
  });

  socket.on('start_game', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game || game.state !== 'lobby') return;
    if (playerIndexOf(game, socket.id) !== 0) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    if (game.players.length < maxPlayersFor(game)) {
      socket.emit('error', { message: `Waiting for ${maxPlayersFor(game) - game.players.length} more player(s)` });
      return;
    }
    const away = game.players.find(p => p.connected === false);
    if (away) {
      socket.emit('error', { message: `Waiting for ${away.name} to reconnect` });
      return;
    }
    if (!game.players.every(p => p.ready)) {
      socket.emit('error', { message: 'Not everyone is ready yet' });
      return;
    }
    console.log('Host started game:', gameId);
    startGame(game);
  });

  socket.on('leave_game', ({ gameId }) => {
    const game = games.get(gameId);
    if (game) leaveGame(game, socket.id);
  });

  // Page reloaded, app reopened, or connection came back: take the seat again
  socket.on('rejoin_game', ({ gameId, token } = {}) => {
    const code = String(gameId || '').trim().toUpperCase();
    const game = games.get(code);
    const idx = game && typeof token === 'string' ? game.players.findIndex(p => p.token === token) : -1;
    if (idx === -1) {
      socket.emit('rejoin_failed');
      return;
    }
    const p = game.players[idx];
    // Another open tab may still hold this seat: that tab steps back
    if (p.id && p.id !== socket.id) {
      const old = playerSockets.get(p.id);
      if (old) {
        old.emit('seat_taken');
        old.leave(code);
      }
      playerSockets.delete(p.id);
    }
    clearGrace(token);
    p.id = socket.id;
    p.connected = true;
    playerSockets.set(socket.id, socket);
    socket.join(code);
    console.log('Player rejoined:', code, p.name);
    broadcastGameState(game);
    publishLobby();
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
    
    if (playerIndexOf(game, socket.id) !== 0) {
      socket.emit('error', { message: 'Only the host can start a new game' });
      return;
    }
    if (game.state === 'lobby' || game.state === 'abandoned') return;
    console.log('Resetting game:', gameId, 'Type:', game.gameType);
    
    if (game.gameType === 'lorum') {
      // Reset Lorum game
      game.scores = [0, 0, 0, 0];
      game.gameHistory = [];
      game.contractScores = [];
      game.currentDeal = 0;
      game.currentDealer = 0;
      game.usedContracts = [false, false, false, false, false, false, false];
      
      const lorumGame = require('./lorumGame');
      lorumGame.startLorumDeal(game);
      broadcastGameState(game);
    } else {
      // Reset Mexico game
      game.scores = [0, 0, 0];
      game.gameHistory = [];
      game.currentDealer = 0;
      
      startNewRound(game);
    }
  });
  
  socket.on('chat_message', ({ gameId, message: rawMessage }) => {
    let message = rawMessage;
    const game = games.get(gameId);
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const playerName = game.players[playerIndex].name;
    const timestamp = Date.now();
    message = String(message || '').trim().slice(0, 200);
    if (!message) return;
    
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
  
  // Lorum-specific events
  socket.on('select_contract', ({ gameId, contractId }) => {
    const game = games.get(gameId);
    if (!game || game.gameType !== 'lorum') return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    if (playerIndex !== game.contractSelector) {
      socket.emit('error', { message: 'Only first player can select contract' });
      return;
    }
    
    const lorumGame = require('./lorumGame');
    const result = lorumGame.selectContract(game, contractId);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    } else {
      broadcastGameState(game);
    }
  });
  
  socket.on('play_lorum_card', ({ gameId, card }) => {
    const game = games.get(gameId);
    if (!game || game.gameType !== 'lorum') return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const lorumGame = require('./lorumGame');
    const result = lorumGame.playLorumCard(game, playerIndex, card);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    } else {
      broadcastGameState(game);
      
      // If trick is complete, wait 3 seconds before continuing
      if (result.needsDelay) {
        setTimeout(() => {
          lorumGame.continueLorumAfterTrick(game);
          broadcastGameState(game);
        }, TRICK_DELAY);
      }
    }
  });
  
  socket.on('play_lora_card', ({ gameId, card }) => {
    const game = games.get(gameId);
    if (!game || game.gameType !== 'lorum') return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const lorumGame = require('./lorumGame');
    const result = lorumGame.playLoraCard(game, playerIndex, card);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    } else {
      broadcastGameState(game);
    }
  });
  
  socket.on('pass_lora', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game || game.gameType !== 'lorum') return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const lorumGame = require('./lorumGame');
    const result = lorumGame.passLoraPlay(game, playerIndex);
    if (!result.success) {
      socket.emit('error', { message: result.error });
    } else {
      broadcastGameState(game);
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Player disconnected:', socket.id, 'Reason:', reason);
    playerSockets.delete(socket.id);
    // Keep the seat for a while: the player may come back with their token
    for (const game of [...games.values()]) {
      const idx = playerIndexOf(game, socket.id);
      if (idx === -1) continue;
      const p = game.players[idx];
      p.id = null;
      p.connected = false;
      startGrace(game, p.token);
      broadcastGameState(game);
    }
    publishLobby();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
