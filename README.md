# Classic 777

A three-reel, one-line casino slot machine in plain HTML, CSS and JavaScript.

- Pull the chrome handle on the side: click/touch the red ball and drag it down. Pull it all the way to trip the reels.
- Or press **SPIN**, **Space** or **Enter** and the handle pulls itself.
- **BET ONE** cycles 1–3 coins. **MAX BET** bets 3 and spins. 777 on 3 coins pays the 1500 jackpot.
- Every sound is generated live with the Web Audio API: ratchet, clunk, spring, reel ticks, stops, bells and coins. There are no audio files.
- Credits are saved in `localStorage`.

## Run

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```
