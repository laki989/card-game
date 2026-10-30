# Mexico & Lorum

Real-time multiplayer Serbian card games in the browser: **Mexico** (3 players) and **Lorum** (4 players). Node.js + Socket.IO server, React front end (no build step).

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Node 18 or newer. Open the page in several browser windows (or on several devices on the same network) to play.

## How a game starts

1. A player enters their name, picks a game (and for Lorum, the contract order) and clicks **Create table**. They become the host.
2. They share the 6-letter table code. Others enter it and click **Join**; they land in the lobby around the table.
3. Each guest taps **I'm ready**. The host's **Start game** button unlocks once every seat is filled and everyone is ready.
4. Leaving the lobby frees the seat (if the host leaves, the next player becomes host). Leaving after the deal closes the table for everyone with a message.
5. If a player's connection drops (closed tab, killed app, lost Wi-Fi, locked phone), their seat is held for two minutes and the others see "reconnecting". Opening the game again on the same device takes the seat back automatically. The seat is saved in the browser under `cardgames.session`. If the window runs out, the seat is released as in step 4. Starting a game waits until nobody is away.

The host can start a fresh game (scores back to 0) from the menu, or with **Play again** when a game ends.

## Files

```
server.js           Server, lobby, Mexico rules
lorumGame.js        Lorum rules (7 contracts, Lora layout, scoring)
public/index.html   Page shell
public/app.js       The whole UI (React, compiled in the browser)
public/styles.css   Styles, tokens match the Pencil design (Card Game.pen)
public/img/         Card images + suit symbols
```

### Card images

Dealt cards use the illustrated images in `public/img/`, named `{suit}-{rank}.webp`:

- suit: `H` hearts, `B` bells, `L` leaves, `A` acorns
- rank: `A`, `K`, `Q`, `J`, `10`, `09`, `08`, `07`

For example `H-A.webp`, `L-09.webp`. If an image is missing, that card is drawn with its rank and suit symbol instead, so the game still works.

Suit symbols (trump picker, Lora columns, game tiles) are `a-symbol.png`, `b-symbol.png`, `h-symbol.png`, `l-symbol.png`. Opponents' hands use `back.webp`.

### Phones and table textures

On phones (and narrow portrait tablets) the game switches to a one-column layout: opponents across the top, the table in the middle, your hand at the bottom, and the history and scoreboard as bottom sheets.

Each player can pick their own table in the in-game **Menu → Table**: green felt, kafana cloth, or a wooden table (`img/wood.jpg`). The choice is remembered on that device.

### Language

English and Serbian. Switch on the start screen (top right) or in **Menu → Language**; the choice is remembered per device, and the first visit follows the browser language. All texts live in `public/i18n.js`.

### Buy the creator a round

The receipt (header button, menu, start screen, game over) shows three fixed rounds and a custom amount. The QR code is rebuilt for the chosen amount using the NBS IPS format every Serbian banking app reads. Recipient, account, payment code, purpose and the amounts are in `public/config.js`. QR drawing uses `public/vendor/qrcode.js` (qrcode-generator, MIT).

## Settings

| Environment variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `TRICK_DELAY_MS` | `3000` | How long a finished trick stays on the table |
| `RECONNECT_GRACE_MS` | `120000` | How long a dropped player's seat is held |
