const PUSHER_APP_KEY = "9eba34026528cc57f0f4";
const PUSHER_CLUSTER = "us2";
const AUTH_ENDPOINT = "https://pusher-auth-server-six.vercel.app/api/pusher-auth"

Pusher.logToConsole = true;

var pusher = new Pusher(PUSHER_APP_KEY, {
  cluster: PUSHER_CLUSTER,
  authEndpoint: AUTH_ENDPOINT,
});

let channel = null;
let gameId = "";
let isHost = false;

// Detect if we're on game.html
const isGamePage = window.location.pathname.includes("game.html");

if (isGamePage) {
  const params = new URLSearchParams(window.location.search);
  gameId = params.get("gameId") || "";
  isHost = params.get("host") === "true";

  if (gameId) connectToGame(); // join the game from game.html
}

class Card {
  constructor(props, x, y) {
    this.number = props[0];
    this.color = props[1];
    this.fill = props[2];
    this.shape = props[3];

    this.selected = false;
    this.card = null;

    this.x = x || 0;
    this.y = y || 0;

    this.cardWidth = null;
    this.cardHeight = null;
  }
  getProperties() {
    // Convert properties to human-readable names

    return {
      number: this.number,
      color: this.color == 1 ? "red" : this.color == 2 ? "green" : "purple", // red, green, purple
      fill: this.fill == 1 ? "filled" : this.fill == 2 ? "empty" : "stripped", // filled, striped, empty
      shape: this.shape == 1 ? "rect" : this.shape == 2 ? "ellipse" : "diamond", // oval, squiggle, diamond
    };
  }
  getRawProperties() {
    // Return raw properties without converting to color or shape names
    // This is useful for internal logic or comparisons
    // Returns an object with raw values

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
  render(two, cardWidth = 80, cardHeight = 120) {
    const h = cardHeight / 6;
    const w = cardWidth / 3;
    const colors = ["red", "green", "purple"];
    this.card = two.makeGroup();
    this.cardWidth = cardWidth; // Store for hit detection
    this.cardHeight = cardHeight;

    // Card background
    const card = two.makeRoundedRectangle(
      this.x,
      this.y,
      cardWidth,
      cardHeight,
      5
    );
    card.fill = "white";
    card.stroke = "black";
    card.linewidth = 2;
    this.card.add(card);

    // Add shapes to the group
    for (let i = 0; i < this.number; i++) {
      let cy = this.y + (i - (this.number - 1) / 2) * h * 1.5;
      let shape;
      if (this.shape === 1) {
        shape = two.makeRectangle(this.x, cy, w, h);
      } else if (this.shape === 2) {
        shape = two.makeEllipse(this.x, cy, w / 2, h / 2);
      } else if (this.shape === 3) {
        shape = two.makePath(
          [
            new Two.Anchor(this.x, cy + h / 2),
            new Two.Anchor(this.x + w / 2, cy),
            new Two.Anchor(this.x, cy - h / 2),
            new Two.Anchor(this.x - w / 2, cy),
            new Two.Anchor(this.x, cy + h / 2),
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
  contains(x, y) {
    // Use the card's center and dimensions for hit detection
    // You must store cardWidth and cardHeight in the Card instance during render
    if (!this.card || !this.cardWidth || !this.cardHeight) return false;
    return (
      x >= this.x - this.cardWidth / 2 &&
      x <= this.x + this.cardWidth / 2 &&
      y >= this.y - this.cardHeight / 2 &&
      y <= this.y + this.cardHeight / 2
    );
  }
}

let gameContainer = document.getElementById("game-container");
let cards = []; // Array to hold card instances
let selectedCards = [];

function createGame() {
  gameId = makeid(4);
  isHost = true;
  window.location.replace(`game.html?gameId=${gameId}&host=${isHost}`);
  connectToGame(gameId);
}

function joinGame() {
  const input = document.getElementById("join-input");
  if (!input) return;

  const code = input.value.trim().toUpperCase();
  if (code.length === 4) {
    gameId = code;
    isHost = false;
    window.location.href = `game.html?gameId=${gameId}&host=${isHost}`;
  } else {
    alert("Please enter a valid 4-character Game ID.");
  }
}

function connectToGame() {
  channel = pusher.subscribe(`private-${gameId}`);

  channel.bind("pusher:subscription_succeeded", () => {
    console.log(`Connect to game with Id ${gameId}`);

    if (!isHost) {
      channel.trigger("client-joined", { msg: "Client joined" });
    } else {
      startGame();
    }
  });

  if (isHost) {
    channel.bind("client-joined", (data) => {
      console.log("Client Joined:", data);
      //sendMessage("Client joined the game.");
      sendGameState();
    });

    channel.bind("client-set", (idxs) => {
      console.log("Client found a set");
    });
  } else {
    channel.bind("client-game-state", (data) => {
      //console.log(data, data.indexs)
      if (cards.length == 0) {
        for (let i = 0; i < data.indexs.length; i++) {
          cards.push(new Card(convertToProperties(data.indexs[i])));
        }
        startGame();
      } else {
        for (let i = 0; i < data.indexs.length; i++) {
          cards[i] = new Card(convertToProperties(data.indexs[i]));
        }
      }
    });
  }
}

function sendGameState() {
  if (isHost && channel) {
    let indexs = []
    cards.forEach(card => {
      indexs.push(convertToIndex(card.getRawProperties()));
    });
    channel.trigger("client-game-state", { indexs });
  }
}

function startGame() {
  gameContainer.style.display = "block";
  gameContainer.innerHTML = ""; // Clear previous content
  gameContainer.className = "grid-container"; // Add grid styling

  // Get container size
  const width = gameContainer.clientWidth || 800;
  const height = gameContainer.clientHeight || 600;

  const two = new Two({
    width: width,
    height: height,
    autostart: true,
  }).appendTo(gameContainer);

  // Responsive grid
  const rows = 3,
    cols = 4;
  const cardHeight = height / (rows + 1) / 1.2;
  const cardWidth = (cardHeight * 1) / 1.5;

  console.log(cards);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      // Center cards in grid
      const x = (j + 1) * cardWidth * 1.2 + width / 2 - 3 * cardWidth;
      const y = (i + 1) * cardHeight * 1.2 + height / 2 - 2.4 * cardHeight;
      if (isHost) {
        cards[IX(i, j)] = new Card(
          convertToProperties(Math.floor(Math.random() * 81)),
          x,
          y
        );
      }

      cards[IX(i, j)].render(two, cardWidth, cardHeight); // Pass size
    }
  }

  gameContainer.addEventListener("click", function (event) {
    const rect = gameContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if a card was clicked
    cards.forEach((card) => {
      if (card.contains(x, y)) {
        card.selected = !card.selected;

        if (card.selected) {
          card.card.children[0].stroke = "red"; // Change outline color when selected
          card.card.children[0].linewidth = 4; // Thicker outline
          selectedCards.push(card);
        } else {
          card.card.children[0].stroke = "black"; // Default outline color
          card.card.children[0].linewidth = 2; // Default thickness
          if (selectedCards.indexOf(card) == 0) {
            selectedCards.shift();
          } else {
            selectedCards.pop();
          }
          console.log(selectedCards);
        }

        console.log(selectedCards.length);

        if (selectedCards.length == 3) {
          let mainText = null;
          if (checkSet() == 1) {
            mainText = two.makeText(
              "Set is Correct. +1 Point",
              width / 2,
              height / 2
            );
            mainText.fill = "#39ff14";
            mainText.size = Math.max(width, height) / 20;
            mainText.stroke = "#24a30eff";
            mainText.linewidth = 1;

            selectedCards.forEach((sCard) => {
              sCard.setRawProperties(
                convertToProperties(Math.floor(Math.random() * 81))
              );
            });
          } else {
            mainText = two.makeText(
              "Set is Incorrect. -1 Point",
              width / 2,
              height / 2
            );
            mainText.fill = "#ff1414ff";
            mainText.size = Math.max(width, height) / 20;
            mainText.stroke = "#a30e0eff";
            mainText.linewidth = 1;
          }

          setTimeout(() => {
            two.remove(mainText);
            two.update();
          }, 1500);

          selectedCards.forEach((sCard) => {
            sCard.selected = false;
            sCard.card.children[0].stroke = "black";
            sCard.card.children[0].stroke = 2;
          });
          two.update();

          selectedCards = [];
        }

        two.update();
      }
    });
  });

  two.update();
}

function checkSet() {
  if (selectedCards.length != 3) {
    console.error(
      "Incorrect length of selected cards, it should be 3 but it is actually ",
      selectedCards.length
    );
    return -1;
  }

  let acceptedVals = [3, 6, 9];

  let number = 0;
  selectedCards.forEach((sCard) => {
    number += sCard.number;
  });
  if (!acceptedVals.includes(number)) return -1;

  let color = 0;
  selectedCards.forEach((sCard) => {
    color += sCard.color;
  });
  if (!acceptedVals.includes(color)) return -1;

  let fill = 0;
  selectedCards.forEach((sCard) => {
    fill += sCard.fill;
  });
  if (!acceptedVals.includes(fill)) return -1;

  let shape = 0;
  selectedCards.forEach((sCard) => {
    shape += sCard.shape;
  });
  if (!acceptedVals.includes(shape)) return -1;

  return 1;
}

// Utils
function IX(x, y) {
  // Convert x and y to a unique index
  return x * 4 + y; //3 + y;
}

function convertToProperties(idx) {
  // Each property is a digit in base-3, plus 1 to shift from 0-2 to 1-3
  let props = [];
  for (let i = 0; i < 4; i++) {
    props.unshift((idx % 3) + 1);
    idx = Math.floor(idx / 3);
  }
  return props; // [prop1, prop2, prop3, prop4]
}

function convertToIndex(card) {
  return (((card.number - 1) * 3 + (card.color - 1)) * 3 + (card.fill - 1)) * 3 + (card.shape - 1);
}

function makeid(length) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function addMessage(text) {
  const li = document.createElement("li");
  li.textContent = text;
  document.getElementById("messages").appendChild(li);
}
