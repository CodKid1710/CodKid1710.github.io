// ========================
// PLAYER CLASS
// ========================
class Player {
  constructor(name, id, score) {
    this.name = name;
    this.userId = id;
    this.score = score || 0;
  }
}

// ========================
// Pusher Configuration
// ========================
const PUSHER_APP_KEY = "9eba34026528cc57f0f4";
const PUSHER_CLUSTER = "us2";
const AUTH_ENDPOINT =
  "https://pusher-auth-server-six.vercel.app/api/pusher-auth";

let channel = null;
let gameId = "";
let isHost = false;
let username = "";
let userId = makeid(8); // Random user ID for session

// Enable Pusher debug logging
Pusher.logToConsole = true;

// Create Pusher instance with authentication
var pusher;

let cards = [];
let selectedCards = [];
let players = [];

let width, height, rows, cols, cardHeight, cardWidth;

// ========================
// Detect if we're on game.html and auto-connect
// ========================
const isGamePage = window.location.pathname.includes("game.html");

if (isGamePage) {
  const params = new URLSearchParams(window.location.search);
  gameId = params.get("gameId") || "";
  isHost = params.get("host") === "true";
  username = params.get("name") || "Undefined";

  if (gameId) connectToGame();
}
// ========================
// Game Layout Setup
// ========================
let gameContainer = document.getElementById("game-container");

gameContainer.style.display = "block";
gameContainer.innerHTML = "";
gameContainer.className = "grid-container";

width = gameContainer.clientWidth || 800;
height = gameContainer.clientHeight || 600;

// Grid parameters
rows = 3;
cols = 4;
cardHeight = height / (rows + 1) / 1.2;
cardWidth = (cardHeight * 1) / 1.5;

const two = new Two({
  width,
  height,
  autostart: true,
}).appendTo(gameContainer);

// ========================
// GAME FLOW FUNCTIONS
// ========================

/**
 * Create a new game as the host
 */
function createGame() {
  gameId = makeid(4);
  isHost = true;
  const nameInput = document.getElementById("name-input");
  if (!nameInput) return;
  username = nameInput.value.trim().toUpperCase();
  window.location.replace(
    `game.html?gameId=${gameId}&host=${isHost}&name=${username}`
  );
  connectToGame(gameId);
}

/**
 * Join an existing game using a Game ID
 */
function joinGame() {
  const codeInput = document.getElementById("join-input");
  if (!codeInput) return;

  const nameInput = document.getElementById("name-input");
  if (!nameInput) return;

  const code = codeInput.value.trim().toUpperCase();
  username = nameInput.value.trim().toUpperCase();
  if (code.length === 4) {
    gameId = code;
    isHost = false;
    window.location.href = `game.html?gameId=${gameId}&host=${isHost}&name=${username}`;
    sendMessage("Joined game");
  } else {
    alert("Please enter a valid 4-character Game ID.");
  }
}

/**
 * Connect to a Pusher presence channel for the current game
 */
function connectToGame() {
  players.push(new Player(username, userId));
  console.log(username);
  pusher = new Pusher(PUSHER_APP_KEY, {
  cluster: PUSHER_CLUSTER,
  authEndpoint: AUTH_ENDPOINT,
  auth: {
    params: {
      user_id: userId,
      name: username,
    },
  },
});

  channel = pusher.subscribe(`presence-${gameId}`);

  channel.bind("pusher:subscription_succeeded", () => {
    console.log(`Connected to game with ID ${gameId}`);

    if (isHost) {
      startGame();
    }
  });

  channel.bind("pusher:member_added", (member) => {
    console.log("Player joined:", member.info.name);
    sendMessage("Player joined: " + member.info.name);

    if (isHost) {
      players.push(new Player(member.info.name, member.id));
      sendGameState();
    }

    updatePlayers(players);
    sendGameState();
  });

  channel.bind("pusher:member_removed", (member) => {
    console.log("Player left:", member.info.name);
    sendMessage("Player left: " + member.info.name);

    if (isHost) {
      for (let i = 0; i < players.length; i++) {
        if (players[i].userId == member.id) {
          players.splice(i, 1);
        }
      }
    }

    updatePlayers(players);
    sendGameState();
  });

  // Host-specific listeners
  if (isHost) {
    channel.bind("client-found-set", (data) => {
      let _selectedCards = [];
      data.indexs.forEach((index) => {
        _selectedCards.push(new Card(convertToProperties(index)));
      });
      let valid = checkSet(_selectedCards);
      let userId = data.userId;
      channel.trigger("client-found-set-response", { valid, userId });
    });

    // Client-specific listeners
  } else {
    channel.bind("client-game-state", (data) => {
      if (cards.length === 0) {
        for (let i = 0; i < data.indexs.length; i++) {
          cards.push(new Card(convertToProperties(data.indexs[i])));
        }
        startGame();
      } else {
        for (let i = 0; i < data.indexs.length; i++) {
          cards[i] = new Card(convertToProperties(data.indexs[i]));
        }
      }
      renderGame();

      players = [];
      data.players.forEach(player => {
        players.push(new Player(player.name, player.userId, player.score))
      });
      updatePlayers(players);
    });
  }

  channel.bind("client-found-set-response", (data) => {
    console.log("hello");
    let valid = data.valid;
    let userId = data.userId;

    updatePlayerScore(userId, valid);
    updatePlayers(players);
    sendMessage(userId + " recived " + valid + "points");
    if (userId == userId) {
      let mainText = null;

      if (valid === 1) {
        mainText = two.makeText(
          "Set is Correct. +1 Point",
          width / 2,
          height / 2
        );
        mainText.fill = "#39ff14";
        mainText.size = Math.max(width, height) / 20;
        mainText.stroke = "#24a30eff";
      } else {
        mainText = two.makeText(
          "Set is Incorrect. -1 Point",
          width / 2,
          height / 2
        );
        mainText.fill = "#ff1414ff";
        mainText.size = Math.max(width, height) / 20;
        mainText.stroke = "#a30e0eff";
      }

      setTimeout(() => {
        two.remove(mainText);
        two.update();
      }, 1500);
    }
  });

  document.getElementById("game-id").textContent = gameId;
  document.getElementById("player-role").textContent = isHost
    ? "Host"
    : "Client";
}

function updatePlayerScore(userId, delta) {
  // Find the player by ID
  const player = players.find(p => p.userId === userId);

  if (player) {
    player.score += delta; // Add or subtract based on delta
    console.log(`Updated ${player.name}'s score to ${player.score}`);

    updateScoreboard(players); // Refresh UI
    sendGameState(); // Keep everyone in sync
  } else {
    console.warn(`Player with ID ${userId} not found.`);
  }
}

function updatePlayers(players) {
  let playerList = document.getElementById("scoreboard");
  playerList.innerHTML = "";

  players.forEach((player) => {
    const playerBar = document.createElement("li");

    // Highlight your own name
    const nameSpan = document.createElement("span");
    nameSpan.textContent = player.name;
    if (player.userId === userId) {
      nameSpan.style.fontWeight = "bold";
      nameSpan.style.color = "#d3ffccff"; // neon green highlight
    }

    // Score aligned to the right
    const scoreSpan = document.createElement("span");
    scoreSpan.textContent = player.score ?? 0;
    scoreSpan.style.float = "right";

    playerBar.appendChild(nameSpan);
    playerBar.appendChild(scoreSpan);

    playerList.appendChild(playerBar);
  });
}


/**
 * Send current game state (card data) to all clients
 */
function sendGameState() {
  if (isHost && channel) {
    let indexs = cards.map((card) => convertToIndex(card.getRawProperties()));
    channel.trigger("client-game-state", { indexs, players });
  }
}

function renderGame() {
  // Generate and render cards
  console.log("started");
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const x = (j + 1) * cardWidth * 1.2 + width / 2 - 3 * cardWidth;
      const y = (i + 1) * cardHeight * 1.2 + height / 2 - 2.4 * cardHeight;

      if (isHost) {
        cards[IX(i, j)] = new Card(
          convertToProperties(Math.floor(Math.random() * 81)));
      }

      cards[IX(i, j)].render(x, y);
    }
  }
}

/**
 * Initialize and render the game board
 */
function startGame() {
  renderGame();

  // Click event handler for card selection
  gameContainer.addEventListener("click", function (event) {
    const rect = gameContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    console.log("Click", x, y, cards[4].contains(x, y));

    cards.forEach((card) => {
      if (card.contains(x, y)) {
        card.selected = !card.selected;
        console.log("selected")

        if (card.selected) {
          card.card.children[0].stroke = "red";
          card.card.children[0].linewidth = 4;
          selectedCards.push(card);
        } else {
          card.card.children[0].stroke = "black";
          card.card.children[0].linewidth = 2;
          selectedCards = selectedCards.filter((c) => c !== card);
        }

        if (selectedCards.length === 3) {
          if (!isHost) {
            let indexs = [];
            selectedCards.forEach((selectedCard) => {
              indexs.push(convertToIndex(selectedCard));
            });
            channel.trigger("client-found-set", { indexs, userId });
          } else {
            let valid = checkSet(selectedCards);
            channel.trigger("client-found-set-response", { valid, userId });
          }

          selectedCards.forEach((sCard) => {
            sCard.selected = false;
            sCard.card.children[0].stroke = "black";
          });

          selectedCards = [];
        }

        two.update();
      }
    });
  });

  two.update();
}

/**
 * Check if a set of 3 cards forms a valid "Set"
 */
function checkSet(sCards) {
  if (sCards.length !== 3) {
    console.error(`Expected 3 cards, got ${sCards.length}`);
    return -1;
  }

  let acceptedVals = [3, 6, 9];

  let number = sCards.reduce((sum, c) => sum + c.number, 0);
  if (!acceptedVals.includes(number)) return -1;

  let color = sCards.reduce((sum, c) => sum + c.color, 0);
  if (!acceptedVals.includes(color)) return -1;

  let fill = sCards.reduce((sum, c) => sum + c.fill, 0);
  if (!acceptedVals.includes(fill)) return -1;

  let shape = sCards.reduce((sum, c) => sum + c.shape, 0);
  if (!acceptedVals.includes(shape)) return -1;

  return 1;
}

// ========================
// UTILITY FUNCTIONS
// ========================

/**
 * Convert grid coordinates to a 1D array index
 */
function IX(x, y) {
  return x * 4 + y;
}

/**
 * Convert a numeric index to card properties [number, color, fill, shape]
 */
function convertToProperties(idx) {
  let props = [];
  for (let i = 0; i < 4; i++) {
    props.unshift((idx % 3) + 1);
    idx = Math.floor(idx / 3);
  }
  return props;
}

/**
 * Convert card properties to a numeric index
 */
function convertToIndex(card) {
  return (
    (((card.number - 1) * 3 + (card.color - 1)) * 3 + (card.fill - 1)) * 3 +
    (card.shape - 1)
  );
}

/**
 * Generate a random alphanumeric ID of given length
 */
function makeid(length) {
  let result = "";
  let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Append a message to the messages list
 */
function sendMessage(text) {
  const li = document.createElement("li");
  li.textContent = text;
  document.getElementById("messages").appendChild(li);
}

// ========================
// CARD CLASS (uses _center for hit testing)
// ========================
class Card {
  constructor(props) {
    this.number = props[0];
    this.color  = props[1];
    this.fill   = props[2];
    this.shape  = props[3];

    this.selected = false;
    this.card     = null; // Two.js group
    this._center = null;
    this.x;           // last render x
    this.y;           // last render y
  }

  getProperties() {
    return {
      number: this.number,
      color:  this.color === 1 ? "red" : this.color === 2 ? "green" : "purple",
      fill:   this.fill === 1 ? "filled" : this.fill === 2 ? "empty" : "striped",
      shape:  this.shape === 1 ? "rect" : this.shape === 2 ? "ellipse" : "diamond",
    };
  }

  getRawProperties() {
    return {
      number: this.number,
      color:  this.color,
      fill:   this.fill,
      shape:  this.shape,
    };
  }

  setRawProperties(props) {
    this.number = props[0];
    this.color  = props[1];
    this.fill   = props[2];
    this.shape  = props[3];
  }

  /**
   * Render the card using Two.js.
   * We DO NOT set group.translation here (that changed layout earlier for you).
   * Instead we draw shapes at absolute x,y (as before) and store _center for hit testing.
   */
  render(x, y) {
    if (typeof two === "undefined") {
      console.error("Two.js instance (two) is not available.");
      return;
    }
    console.log(this);
    // Save position
    this.x = x;
    this.y = y;

    const h = cardHeight / 6;
    const w = cardWidth / 3;
    const colors = ["red", "green", "purple"];

    // Make a fresh group so re-render doesn't duplicate
    if (this.card) two.remove(this.card);
    this.card = two.makeGroup();

    // Card background at absolute coords (same as before)
    const bg = two.makeRoundedRectangle(x, y, cardWidth, cardHeight, 5);
    bg.fill = "white";
    bg.stroke = "black";
    bg.linewidth = 2;
    this.card.add(bg);

    // Add shapes (placed at absolute coords)
    for (let i = 0; i < this.number; i++) {
      const cy = y + (i - (this.number - 1) / 2) * h * 1.5;
      let shape;

      if (this.shape === 1) {
        shape = two.makeRectangle(x, cy, w, h);
      } else if (this.shape === 2) {
        shape = two.makeEllipse(x, cy, w / 2, h / 2);
      } else if (this.shape === 3) {
        shape = two.makePath(
          [
            new Two.Anchor(x, cy + h / 2),
            new Two.Anchor(x + w / 2, cy),
            new Two.Anchor(x, cy - h / 2),
            new Two.Anchor(x - w / 2, cy),
            new Two.Anchor(x, cy + h / 2),
          ],
          true
        );
      } else {
        continue;
      }

      shape.fill = this.fill === 1 ? colors[this.color - 1]
                  : this.fill === 2 ? "white"
                  : "lightgray";
      shape.stroke = colors[this.color - 1];
      shape.linewidth = 4;
      this.card.add(shape);
    }
  }

/**
   * Return true when point (px,py) is inside this card's rectangle.
   * Uses the stored this.x/this.y as the center of the card.
   */
  contains(px, py) {
    console.log(this.x);
    const halfWidth = cardWidth / 2;
    const halfHeight = cardHeight / 2;

    const inX = px >= this.x - halfWidth && px <= this.x + halfWidth;
    const inY = py >= this.y - halfHeight && py <= this.y + halfHeight;

    return inX && inY;
  }
}
