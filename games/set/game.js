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

// Track add-3-cards votes (userIds)
let addCardsUserId = new Set();

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
  updatePlayers(players);
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
      // initialize vote label for host view
      updateVoteStatus();
    }
  });

  channel.bind("pusher:member_added", (member) => {
    console.log("Player joined:", member.info.name);
    sendMessage("Player joined: " + member.info.name);

    if (isHost) {
      players.push(new Player(member.info.name, member.id));
      // Recompute % with new denominator
      updateVoteStatus();
      sendGameState();
    }

    updatePlayers(players);
  });

  channel.bind("pusher:member_removed", (member) => {
    console.log("Player left:", member.info.name);
    sendMessage("Player left: " + member.info.name);

    if (isHost) {
      // remove from players list
      for (let i = 0; i < players.length; i++) {
        if (players[i].userId == member.id) {
          players.splice(i, 1);
          break;
        }
      }
      // remove vote if they had voted and recompute %
      addCardsUserId.delete(member.id);
      updateVoteStatus();
      sendGameState();
    }

    updatePlayers(players);
  });

  // ========================
  // HOST-ONLY LISTENERS
  // ========================
  if (isHost) {
    channel.bind("client-found-set", (data) => {
      let _selectedCards = [];
      data.indexs.forEach((index) => {
        _selectedCards.push(new Card(convertToProperties(index)));
      });
      let valid = checkSet(_selectedCards);
      let userId = data.userId;

      cols = cards.length / 3;
      if (valid == 1) {
        if (cols == 4) {
          data.indexs.forEach((index) => {
            findCard(index).setRawProperties(
              convertToProperties(Math.floor(Math.random() * 81))
            );
          });
        } else {
          cols -= 1;
          data.indexs.forEach((index) => {
            cards.splice(cards.indexOf(findCard(index)), 1);
          });
          cols = cards.length / 3;
        }
        sendMessage("Valid Set found");
        sendGameState();
      }

      two.clear();
      renderGame();
      two.update();

      clearVotesEverywhere();
      channel.trigger("client-found-set-response", { valid, userId });
      updatePlayerScore(userId, valid);
      sendMessage(findPlayer(userId).name + " recieved " + valid + " points");
      updatePlayers(players);
    });

    // Receive client votes
    channel.bind("client-add-cards-vote", (data) => {
      addCardsUserId.add(data.userId);
      onVotesChangedMaybeAdd();
    });

    channel.bind("client-add-cards-unvote", (data) => {
      addCardsUserId.delete(data.userId);
      onVotesChangedMaybeAdd();
    });
  }

  // ========================
  // SHARED LISTENERS
  // ========================
  channel.bind("client-update-add-cards-votes", (data) => {
    const btn = document.getElementById("add-cards-button");
    if (btn) btn.textContent = `Add 3 Cards (${data.percent}%)`;
  });

  channel.bind("client-clear-add-cards-votes", () => {
    addCardsUserId.clear();
    const btn = document.getElementById("add-cards-button");
    if (btn) btn.textContent = "Add 3 Cards (0%)";
  });

  channel.bind("client-game-state", (data) => {
    if (cards.length === 0) {
      for (let i = 0; i < data.indexs.length; i++) {
        cards.push(new Card(convertToProperties(data.indexs[i])));
      }
      startGame();
    } else {
      cards = [];
      for (let i = 0; i < data.indexs.length; i++) {
        cards[i] = new Card(convertToProperties(data.indexs[i]));
      }
    }

    cols = cards.length / 3;
    two.clear();
    renderGame();
    two.update();

    players = [];
    data.players.forEach((player) => {
      players.push(new Player(player.name, player.userId, player.score));
    });
    updatePlayers(players);

    // Update vote UI for everyone based on host's state
    if (data.votes) {
      const btn = document.getElementById("add-cards-button");
      if (btn) btn.textContent = `Add 3 Cards (${data.votes.percent}%)`;
    }
  });

  channel.bind("client-found-set-response", (data) => {
    let valid = data.valid;
    let _userId = data.userId;

    updatePlayerScore(_userId, valid);
    updatePlayers(players);
    sendMessage(findPlayer(_userId).name + " recived " + valid + " points");
    if (userId == _userId) {
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

// ========================
// VOTING BUTTON FUNCTION (toggle)
// ========================
function voteAddCards() {
  // Host updates locally (client events don't echo to sender)
  if (isHost) {
    if (addCardsUserId.has(userId)) {
      addCardsUserId.delete(userId);
    } else {
      addCardsUserId.add(userId);
    }
    onVotesChangedMaybeAdd();
  } else {
    // Clients notify the host
    if (addCardsUserId.has(userId)) {
      channel.trigger("client-add-cards-unvote", { userId });
    } else {
      channel.trigger("client-add-cards-vote", { userId });
    }
  }
}

// ========================
// Vote helpers
// ========================
function updateVoteStatus() {
  const percent =
    players.length > 0
      ? Math.round((addCardsUserId.size / players.length) * 100)
      : 0;

  const btn = document.getElementById("add-cards-button");
  if (btn) btn.textContent = `Add 3 Cards (${percent}%)`;

  // Host informs everyone of the latest percent
  if (channel && isHost) {
    channel.trigger("client-update-add-cards-votes", {
      percent,
      count: addCardsUserId.size,
      total: players.length,
    });
  }
  return percent;
}

function clearVotesEverywhere() {
  addCardsUserId.clear();
  updateVoteStatus(); // will also broadcast 0%
  if (channel && isHost) {
    channel.trigger("client-clear-add-cards-votes", {}, { exclude_self: false });
  }
}

function onVotesChangedMaybeAdd() {
  const percent = updateVoteStatus();
  if (isHost && percent >= 75) {
    clearVotesEverywhere();
    addCards();
  }
}

/**
 * Send current game state (card data) to all clients
 * Also include vote info so late joiners see current %.
 */
function sendGameState() {
  if (isHost && channel) {
    let indexs = cards.map((card) => convertToIndex(card.getRawProperties()));
    const votes = {
      count: addCardsUserId.size,
      total: players.length,
      percent:
        players.length > 0
          ? Math.round((addCardsUserId.size / players.length) * 100)
          : 0,
    };
    channel.trigger("client-game-state", { indexs, players, votes });
  }
}

function renderGame() {
  // Generate and render cards
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const x =
        (j + 0.5) * cardWidth * 1.2 + width / 2 - (cols / 1.6) * cardWidth;
      const y = (i + 1) * cardHeight * 1.2 + height / 2 - 2.4 * cardHeight;

      if (isHost && cards.length == IX(i, j)) {
        let idx;
        do {
          idx = Math.floor(Math.random() * 81)
        } while (findCard(idx) != undefined);
        cards.push(
          new Card(convertToProperties(idx))
        );
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

    cards.forEach((card) => {
      if (card.contains(x, y)) {
        card.selected = !card.selected;

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
            channel.trigger("client-found-set", { indexs, userId }, { exclude_self: false });
          } else {
            let valid = checkSet(selectedCards);
            channel.trigger("client-found-set-response", { valid, userId });

            updatePlayerScore(userId, valid);
            updatePlayers(players);
            sendMessage(
              findPlayer(userId).name + " recived " + valid + " points"
            );

            let mainText = null;

            if (valid == 1) {
              if (cards.length == 12) {
                selectedCards.forEach((sCard) => {
                  findCard(convertToIndex(sCard)).setRawProperties(
                    convertToProperties(Math.floor(Math.random() * 81))
                  );
                });
              } else {
                cols -= 1;

                selectedCards.forEach((sCard) => {
                  const index = cards.indexOf(sCard);
                  if (index == -1) {
                    console.log("Couldn't find card");
                  }
                  cards.splice(index, 1);
                });
              }

              two.clear();
              renderGame();
              two.update();

              sendMessage("Valid Set found");
              sendGameState();

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

function addCards() {
  cols += 1;
  renderGame();
  two.update();
}

// ========================
// UTILITY FUNCTIONS
// ========================

/**
 * Convert grid coordinates to a 1D array index
 */
function IX(x, y) {
  return x * cols + y;
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

function updatePlayerScore(userId, delta) {
  const player = players.find((p) => p.userId === userId);
  if (player) {
    player.score += delta;
  }
}

function updatePlayers(playersArr) {
  let playerList = document.getElementById("scoreboard");
  playerList.innerHTML = "";

  playersArr.forEach((player) => {
    const playerBar = document.createElement("li");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = player.name;
    if (player.userId === userId) {
      nameSpan.style.fontWeight = "bold";
      nameSpan.style.color = "#d3ffccff";
    }

    const scoreSpan = document.createElement("span");
    scoreSpan.textContent = player.score ?? 0;
    scoreSpan.style.float = "right";

    playerBar.appendChild(nameSpan);
    playerBar.appendChild(scoreSpan);

    playerList.appendChild(playerBar);
  });
}

function findPlayer(_userId) {
  return players.find((p) => p.userId === _userId);
}

function findCard(idx) {
  return cards.find((c) => convertToIndex(c) === idx);
}

// ========================
// CARD CLASS
// ========================
class Card {
  constructor(props) {
    this.number = props[0];
    this.color = props[1];
    this.fill = props[2];
    this.shape = props[3];

    this.selected = false;
    this.card = null; // Two.js group
    this._center = null;
    this.x;
    this.y;
  }

  getProperties() {
    return {
      number: this.number,
      color: this.color === 1 ? "red" : this.color === 2 ? "green" : "purple",
      fill: this.fill === 1 ? "filled" : this.fill === 2 ? "empty" : "striped",
      shape:
        this.shape === 1 ? "rect" : this.shape === 2 ? "ellipse" : "diamond",
    };
  }

  getRawProperties() {
    return {
      number: this.number,
      color: this.color,
      fill: this.fill,
      shape: this.shape,
    };
  }

  setRawProperties(props) {
    this.number = props[0];
    this.color = props[1];
    this.fill = props[2];
    this.shape = props[3];
  }

  render(x, y) {
    if (typeof two === "undefined") {
      console.error("Two.js instance (two) is not available.");
      return;
    }
    this.x = x;
    this.y = y;

    const h = cardHeight / 6;
    const w = cardWidth / 3;
    const colors = ["red", "green", "purple"];

    if (this.card) two.remove(this.card);
    this.card = two.makeGroup();

    const bg = two.makeRoundedRectangle(x, y, cardWidth, cardHeight, 5);
    bg.fill = "white";
    bg.stroke = "black";
    bg.linewidth = 2;
    this.card.add(bg);

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

      shape.fill =
        this.fill === 1
          ? colors[this.color - 1]
          : this.fill === 2
          ? "white"
          : "lightgray";
      shape.stroke = colors[this.color - 1];
      shape.linewidth = 4;
      this.card.add(shape);
    }
  }

  contains(px, py) {
    const halfWidth = cardWidth / 2;
    const halfHeight = cardHeight / 2;

    const inX = px >= this.x - halfWidth && px <= this.x + halfWidth;
    const inY = py >= this.y - halfHeight && py <= this.y + halfHeight;

    return inX && inY;
  }
}
