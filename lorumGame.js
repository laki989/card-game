// Lorum Game Logic Module
// 4-player compendium game with 7 contracts

const CONTRACTS = [
  { id: 1, name: 'Minimum', nameLocal: 'Minimum' },
  { id: 2, name: 'Maximum', nameLocal: 'Maksimum' },
  { id: 3, name: 'Queens', nameLocal: 'Dame' },
  { id: 4, name: 'Hearts', nameLocal: 'Srca' },
  { id: 5, name: 'Jack of Clubs', nameLocal: 'Žandar tref' },
  { id: 6, name: 'King of Hearts', nameLocal: 'Kralj srce' },
  { id: 7, name: 'Lora', nameLocal: 'Ređanje' }
];

function createLorumGame(gameId, contractMode) {
  return {
    id: gameId,
    gameType: 'lorum',
    players: [],
    state: 'waiting', // waiting, playing, contract_selection, lora_playing, finished
    contractMode: contractMode, // 'fixed' or 'choice'
    
    // Deal tracking
    currentDeal: 0, // 0-27 (28 total deals)
    currentDealer: 0, // 0-3
    currentContract: 1, // 1-7
    contractSelector: null, // Player who selects contract (first player, not dealer)
    usedContracts: [false, false, false, false, false, false, false], // For choice mode
    
    // Card data
    hands: [[], [], [], []],
    currentPlayer: 0, // Player to dealer's RIGHT starts
    
    // Trick data (contracts 1-6)
    currentTrick: [],
    tricksTaken: [0, 0, 0, 0],
    queensTaken: [0, 0, 0, 0],
    heartsTaken: [0, 0, 0, 0],
    hasJackOfClubs: -1,
    hasKingOfHearts: -1,
    lastTrickWinner: null,
    runningScores: [0, 0, 0, 0],
    
    // Lora/Ređanje data (contract 7)
    loraLayout: {
      acorns: [],
      leaves: [],
      hearts: [],
      bells: []
    },
    loraStartRank: null,
    loraPasses: [0, 0, 0, 0], // Track skips
    
    // Scoring
    scores: [0, 0, 0, 0], // Cumulative scores
    contractScores: [], // History of each contract
    gameHistory: []
  };
}

function dealLorumCards(deck) {
  const hands = [[], [], [], []];
  
  // Deal 8 cards to each of 4 players
  for (let i = 0; i < 32; i++) {
    hands[i % 4].push(deck[i]);
  }
  
  return hands;
}

function startLorumDeal(game) {
  // Create and shuffle deck
  const deck = shuffleDeck(createDeck());
  game.hands = dealLorumCards(deck);
  
  // Reset round data
  game.currentTrick = [];
  game.tricksTaken = [0, 0, 0, 0];
  game.queensTaken = [0, 0, 0, 0];
  game.heartsTaken = [0, 0, 0, 0];
  game.hasJackOfClubs = -1;
  game.hasKingOfHearts = -1;
  game.lastTrickWinner = null;
  game.runningScores = [0, 0, 0, 0];
  game.loraPasses = [0, 0, 0, 0];
  
  // Player to dealer's RIGHT starts (counterclockwise, so +1)
  game.currentPlayer = (game.currentDealer + 1) % 4;
  game.contractSelector = game.currentPlayer; // First player chooses contract
  
  // Determine contract
  if (game.contractMode === 'fixed') {
    // Fixed order: cycle through 1-7
    game.currentContract = (game.currentDeal % 7) + 1;
    game.state = 'playing';
  } else {
    // Choice mode: first player selects
    game.state = 'contract_selection';
  }
}

function selectContract(game, contractId) {
  if (game.state !== 'contract_selection') return { success: false, error: 'Not in contract selection' };
  if (game.usedContracts[contractId - 1]) return { success: false, error: 'Contract already used' };
  
  game.currentContract = contractId;
  game.usedContracts[contractId - 1] = true;
  game.state = game.currentContract === 7 ? 'lora_playing' : 'playing';
  
  return { success: true };
}

// Trick-taking logic (Contracts 1-6)
function playLorumCard(game, playerIndex, card) {
  if (game.state !== 'playing') return { success: false, error: 'Not in playing state' };
  if (game.currentPlayer !== playerIndex) return { success: false, error: 'Not your turn' };
  
  const hand = game.hands[playerIndex];
  const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (cardIndex === -1) return { success: false, error: 'Card not in hand' };
  
  // Validate play
  if (game.currentTrick.length > 0) {
    const ledSuit = game.currentTrick[0].card.suit;
    const hasSuit = hand.some(c => c.suit === ledSuit);
    if (hasSuit && card.suit !== ledSuit) {
      return { success: false, error: 'Must follow suit' };
    }
  }
  
  // Remove card from hand and add to trick
  hand.splice(cardIndex, 1);
  game.currentTrick.push({ playerIndex, card });
  
  // Check if trick is complete
  if (game.currentTrick.length === 4) {
    const trickResult = completeLorumTrick(game);
    return { success: true, needsDelay: trickResult.needsDelay };
  } else {
    // Next player (counterclockwise)
    game.currentPlayer = (game.currentPlayer + 1) % 4;
  }
  
  return { success: true };
}

function completeLorumTrick(game) {
  // Find winner (highest card of led suit)
  const ledSuit = game.currentTrick[0].card.suit;
  let winnerIndex = 0;
  let highestValue = getRankValue(game.currentTrick[0].card.rank);
  
  for (let i = 1; i < 4; i++) {
    const play = game.currentTrick[i];
    if (play.card.suit === ledSuit) {
      const value = getRankValue(play.card.rank);
      if (value > highestValue) {
        highestValue = value;
        winnerIndex = i;
      }
    }
  }
  
  const winner = game.currentTrick[winnerIndex].playerIndex;
  game.tricksTaken[winner]++;
  game.lastTrickWinner = winner;
  
  // Track special cards for scoring
  for (const play of game.currentTrick) {
    if (play.card.rank === 'Q') {
      game.queensTaken[winner]++;
    }
    if (play.card.suit === 'hearts') {
      game.heartsTaken[winner]++;
    }
    if (play.card.suit === 'acorns' && play.card.rank === 'J') {
      game.hasJackOfClubs = winner;
    }
    if (play.card.suit === 'hearts' && play.card.rank === 'K') {
      game.hasKingOfHearts = winner;
    }
  }
  
  // Calculate running scores after each trick
  calculateRunningScores(game);
  
  // Set state to trick_complete for 3-second display
  game.state = 'trick_complete';
  
  // Return flag to tell server to wait
  return { needsDelay: true, winner };
}

function continueLorumAfterTrick(game) {
  const winner = game.lastTrickWinner;
  
  // Check if round is over
  if (game.hands[0].length === 0) {
    scoreLorumContract(game);
    advanceLorumDeal(game);
  } else {
    // Next trick
    game.currentTrick = [];
    game.currentPlayer = winner;
    game.state = 'playing';
    game.lastTrickWinner = null;
  }
}

// Lora/Ređanje logic (Contract 7)
function playLoraCard(game, playerIndex, card) {
  if (game.state !== 'lora_playing') return { success: false, error: 'Not in Lora state' };
  if (game.currentPlayer !== playerIndex) return { success: false, error: 'Not your turn' };
  
  const hand = game.hands[playerIndex];
  const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (cardIndex === -1) return { success: false, error: 'Card not in hand' };
  
  // First card sets the starting rank
  if (!game.loraStartRank) {
    game.loraStartRank = card.rank;
    game.loraLayout[card.suit].push(card);
    hand.splice(cardIndex, 1);
    
    if (hand.length === 0) {
      scoreLoraContract(game);
      advanceLorumDeal(game);
    } else {
      game.currentPlayer = (game.currentPlayer + 1) % 4;
    }
    
    return { success: true };
  }
  
  // Validate card can be played
  const suitPile = game.loraLayout[card.suit];
  
  if (suitPile.length === 0) {
    // Starting new suit - must be starting rank
    if (card.rank !== game.loraStartRank) {
      return { success: false, error: 'Must play starting rank for new suit' };
    }
  } else {
    // Adding to existing suit - must be next in sequence
    const lastCard = suitPile[suitPile.length - 1];
    const nextRank = getNextRank(lastCard.rank);
    if (card.rank !== nextRank) {
      return { success: false, error: 'Must play next card in sequence' };
    }
  }
  
  // Play is valid
  suitPile.push(card);
  hand.splice(cardIndex, 1);
  
  // Check if player finished
  if (hand.length === 0) {
    scoreLoraContract(game);
    advanceLorumDeal(game);
  } else {
    game.currentPlayer = (game.currentPlayer + 1) % 4;
  }
  
  return { success: true };
}

function passLoraPlay(game, playerIndex) {
  if (game.state !== 'lora_playing') return { success: false, error: 'Not in Lora state' };
  if (game.currentPlayer !== playerIndex) return { success: false, error: 'Not your turn' };
  
  // Track the pass
  game.loraPasses[playerIndex]++;
  
  // Move to next player
  game.currentPlayer = (game.currentPlayer + 1) % 4;
  
  return { success: true };
}

// Calculate running scores (shown during play, not final)
function calculateRunningScores(game) {
  const runningScores = [0, 0, 0, 0];
  
  switch (game.currentContract) {
    case 1: // Minimum - +1 per trick so far
      for (let i = 0; i < 4; i++) {
        runningScores[i] = game.tricksTaken[i];
      }
      break;
      
    case 2: // Maximum - show current tricks (final calc at end)
      for (let i = 0; i < 4; i++) {
        runningScores[i] = game.tricksTaken[i];
      }
      break;
      
    case 3: // Queens - +2 per queen so far
      for (let i = 0; i < 4; i++) {
        runningScores[i] = game.queensTaken[i] * 2;
      }
      break;
      
    case 4: // Hearts - +1 per heart so far
      for (let i = 0; i < 4; i++) {
        runningScores[i] = game.heartsTaken[i];
      }
      break;
      
    case 5: // Jack of Clubs
      if (game.hasJackOfClubs !== -1) {
        runningScores[game.hasJackOfClubs] = 8;
      }
      break;
      
    case 6: // King of Hearts
      if (game.hasKingOfHearts !== -1) {
        runningScores[game.hasKingOfHearts] = 8;
      }
      break;
  }
  
  game.runningScores = runningScores;
}

// Scoring functions
function scoreLorumContract(game) {
  const contractScores = [0, 0, 0, 0];
  
  switch (game.currentContract) {
    case 1: // Minimum - +1 per trick
      for (let i = 0; i < 4; i++) {
        contractScores[i] = game.tricksTaken[i];
      }
      break;
      
    case 2: // Maximum - 0-1 tricks = +8, 2+ tricks = 0
      for (let i = 0; i < 4; i++) {
        contractScores[i] = game.tricksTaken[i] < 2 ? 8 : 0;
      }
      break;
      
    case 3: // Queens - +2 per queen
      for (let i = 0; i < 4; i++) {
        contractScores[i] = game.queensTaken[i] * 2;
      }
      break;
      
    case 4: // Hearts - +1 per heart OR -8 if all 8
      for (let i = 0; i < 4; i++) {
        if (game.heartsTaken[i] === 8) {
          contractScores[i] = -8; // Shot the moon
        } else {
          contractScores[i] = game.heartsTaken[i];
        }
      }
      break;
      
    case 5: // Jack of Clubs - +8 for taking it
      if (game.hasJackOfClubs !== -1) {
        contractScores[game.hasJackOfClubs] = 8;
      }
      break;
      
    case 6: // King of Hearts - +8 for taking it
      if (game.hasKingOfHearts !== -1) {
        contractScores[game.hasKingOfHearts] = 8;
      }
      break;
  }
  
  // Add to cumulative scores
  for (let i = 0; i < 4; i++) {
    game.scores[i] += contractScores[i];
  }
  
  // Save to history
  game.contractScores.push({
    deal: game.currentDeal,
    contract: game.currentContract,
    scores: contractScores,
    totalScores: [...game.scores]
  });
}

function scoreLoraContract(game) {
  const contractScores = [0, 0, 0, 0];
  
  // Find who finished (has 0 cards)
  let finisher = -1;
  for (let i = 0; i < 4; i++) {
    if (game.hands[i].length === 0) {
      finisher = i;
      break;
    }
  }
  
  // Finisher gets -8
  contractScores[finisher] = -8;
  
  // Others get +1 per card left + +1 per pass
  for (let i = 0; i < 4; i++) {
    if (i !== finisher) {
      contractScores[i] = game.hands[i].length + game.loraPasses[i];
    }
  }
  
  // Add to cumulative scores
  for (let i = 0; i < 4; i++) {
    game.scores[i] += contractScores[i];
  }
  
  // Save to history
  game.contractScores.push({
    deal: game.currentDeal,
    contract: 7,
    scores: contractScores,
    passes: [...game.loraPasses],
    totalScores: [...game.scores]
  });
}

function advanceLorumDeal(game) {
  game.currentDeal++;
  
  // Check if game is over (28 deals)
  if (game.currentDeal >= 28) {
    game.state = 'finished';
    return;
  }
  
  // Advance dealer after 7 deals
  if (game.currentDeal % 7 === 0) {
    game.currentDealer = (game.currentDealer + 1) % 4;
    
    // Reset used contracts for choice mode
    if (game.contractMode === 'choice') {
      game.usedContracts = [false, false, false, false, false, false, false];
    }
  }
  
  // Start next deal
  startLorumDeal(game);
}

// Helper functions
function getRankValue(rank) {
  const values = { '7': 0, '8': 1, '9': 2, '10': 3, 'J': 4, 'Q': 5, 'K': 6, 'A': 7 };
  return values[rank];
}

function getNextRank(rank) {
  const sequence = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const index = sequence.indexOf(rank);
  return sequence[(index + 1) % 8]; // Wraps around: A -> 7
}

function createDeck() {
  const suits = ['acorns', 'leaves', 'hearts', 'bells'];
  const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
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

module.exports = {
  CONTRACTS,
  createLorumGame,
  startLorumDeal,
  selectContract,
  playLorumCard,
  playLoraCard,
  passLoraPlay,
  continueLorumAfterTrick
};
