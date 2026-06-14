# Galaxy Cinemas Agent — JavaScript Hosting Guide
# Host on Render.com (free) + wire to ElevenLabs

---

## What you have

3 files to deploy:
- server.js       ← the actual scraper + API
- package.json    ← Node.js dependencies
- render.yaml     ← tells Render.com how to run it

---

## STEP 1 — Put files on GitHub (5 minutes)

You need a free GitHub account: github.com

1. Go to github.com → click **New repository**
2. Name it: `galaxy-cinemas-agent`
3. Set to **Public** → click **Create repository**
4. Click **uploading an existing file**
5. Drag and drop all 3 files:
   - server.js
   - package.json
   - render.yaml
6. Click **Commit changes**

Your code is now on GitHub.

---

## STEP 2 — Deploy on Render.com (5 minutes)

Render.com hosts Node.js apps for free.

1. Go to render.com → **Sign up with GitHub**
2. Click **New +** → **Web Service**
3. Click **Connect** next to your `galaxy-cinemas-agent` repo
4. Render auto-detects the render.yaml settings:
   - Build Command: `npm install && npx playwright install chromium --with-deps`
   - Start Command: `npm start`
5. Click **Create Web Service**
6. Wait 3–4 minutes for the build to finish
7. Render gives you a live URL like:
   ```
   https://galaxy-cinemas-agent.onrender.com
   ```

That URL is your server. **Copy it.**

---

## STEP 3 — Test your server (2 minutes)

Open your browser and go to:
```
https://galaxy-cinemas-agent.onrender.com/showtimes
```

You should see live JSON with today's movies at Galaxy Cinemas.

Also test in browser:
```
https://galaxy-cinemas-agent.onrender.com/
```
Shows all available endpoints.

---

## STEP 4 — Wire to ElevenLabs (replaces Make.com entirely)

Go to ElevenLabs → Your Agent → **Tools** tab

### Delete the 3 old Make.com tools (if added)
### Add these 3 new tools:

---

**Tool 1 — get_showtimes**
- Type: Webhook
- Method: GET
- URL: `https://galaxy-cinemas-agent.onrender.com/showtimes`
- Parameters: none
- Description: `Fetches today's live movies and showtimes at Galaxy Cinemas Pookkottumpadam from District.in`

---

**Tool 2 — get_seat_availability**
- Type: Webhook
- Method: POST
- URL: `https://galaxy-cinemas-agent.onrender.com/seats`
- Parameters:
  - `session_id` · String · Required · "Session ID from get_showtimes result"
  - `num_tickets` · Number · Required · "Number of tickets the user wants to book"
- Description: `Returns live available and booked seats for the chosen show`

---

**Tool 3 — generate_booking_link**
- Type: Webhook
- Method: POST
- URL: `https://galaxy-cinemas-agent.onrender.com/booking-link`
- Parameters:
  - `session_id` · String · Required · "Session ID of the chosen show"
  - `movie_name` · String · Required · "Name of the movie"
  - `show_time` · String · Required · "Selected showtime e.g. 06:15 PM"
  - `screen` · String · Required · "Screen name e.g. Screen 1"
  - `seats` · Array · Required · "List of seat IDs the user selected"
  - `num_tickets` · Number · Required · "Total number of tickets"
- Description: `Generates the District.in payment link after user confirms seats`

---

## STEP 5 — Test ElevenLabs agent

Go to ElevenLabs → Your Agent → **Test** tab
Type: "Hi, I want to book a movie ticket"

Watch the agent:
1. Call /showtimes → get live movies
2. Present them to you
3. When you pick a show → call /seats → show real seat map
4. When you pick seats → call /booking-link → send District.in URL

---

## Render.com Free Plan — Important Notes

| Thing to know | Detail |
|---|---|
| Free plan spins down after 15 min inactivity | First request after idle takes ~30 seconds to wake up |
| Fix: use UptimeRobot.com | Free service that pings your server every 5 min to keep it awake |
| Build minutes | 750 free minutes/month — more than enough |
| Bandwidth | 100GB/month free |

### Keep-alive with UptimeRobot (optional but recommended)
1. Go to uptimerobot.com → free account
2. Add monitor → HTTP(S)
3. URL: `https://galaxy-cinemas-agent.onrender.com/`
4. Interval: every 5 minutes
5. Done — server stays warm

---

## Full architecture (no Make.com needed)

```
Customer WhatsApp message
        ↓
ElevenLabs Agent (voice + text)
        ↓ calls tool
Your Render.com server (server.js)
        ↓ opens real browser
District.in Galaxy Cinemas page
        ↓ returns live data
ElevenLabs speaks the result to customer
        ↓
Customer picks seats → booking link sent on WhatsApp
        ↓
Customer taps link → pays on District.in
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| /showtimes returns empty movies array | District.in changed CSS selectors — open an issue or check server logs on Render |
| Server times out | Render free plan is waking up — wait 30 sec and retry |
| Playwright install fails on Render | Make sure render.yaml buildCommand includes `--with-deps` |
| ElevenLabs tool call fails | Check the URL has https:// and no trailing slash |

---

## Monthly cost

| Service | Cost |
|---|---|
| GitHub | Free |
| Render.com | Free |
| ElevenLabs Starter | ~$5/month |
| UptimeRobot | Free |
| **Total** | **~$5/month** |
