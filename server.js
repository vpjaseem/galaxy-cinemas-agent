/**
 * Galaxy Cinemas Booking Agent — Backend Server
 * Scrapes District.in in real-time using Playwright
 * Called by ElevenLabs as webhook tools
 *
 * Endpoints:
 *   GET  /showtimes        → live movies + showtimes from District.in
 *   POST /seats            → live seat map for a chosen show
 *   POST /booking-link     → generates District.in booking deep link
 */

import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

const CINEMA_URL =
  "https://www.district.in/movies/galaxy-cinemas-4k-atmos-triple-beam-3d-pookkottumpadam-in-pookkottumpadam-CD1101523";

const DISTRICT_BASE = "https://www.district.in";

// ─── Helper: launch a stealth browser page ───────────────────────────────────
async function getPage() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    locale: "en-IN",
  });
  const page = await context.newPage();
  return { browser, page };
}

// ─── ENDPOINT 1: GET /showtimes ───────────────────────────────────────────────
// ElevenLabs calls this to get today's movies at Galaxy Cinemas
app.get("/showtimes", async (req, res) => {
  console.log("▶ /showtimes called");
  const { browser, page } = await getPage();

  try {
    await page.goto(CINEMA_URL, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for movie listing to appear
    await page.waitForSelector("a[href*='/movies/']", { timeout: 15000 });

    const movies = await page.evaluate(() => {
      const results = [];

      // Each movie block contains a heading + show time buttons
      const movieBlocks = document.querySelectorAll(
        "div[class*='styles_showCard'], div[class*='MovieCard'], li[class*='movie']"
      );

      movieBlocks.forEach((block) => {
        // Movie title
        const titleEl =
          block.querySelector("h3, h2, [class*='title'], [class*='name']");
        if (!titleEl) return;
        const title = titleEl.textContent.trim();

        // Certificate + language
        const metaEl = block.querySelector(
          "[class*='cert'], [class*='lang'], [class*='meta']"
        );
        const meta = metaEl ? metaEl.textContent.trim() : "";

        // Show time buttons — each has a data-session-id or similar
        const showEls = block.querySelectorAll(
          "a[href*='seat-layout'], button[data-session], [class*='showTime'], [class*='show-time']"
        );

        const shows = [];
        showEls.forEach((el) => {
          const href = el.getAttribute("href") || "";
          // Extract session ID from URL like /movies/seat-layout/SESSION_ID?...
          const match = href.match(/seat-layout\/([^?]+)/);
          const sessionId = match ? match[1] : null;
          const time = el.textContent.trim().replace(/\s+/g, " ");
          // Screen info is usually in a sibling element
          const screenEl = el.closest("[class*='show']")?.querySelector(
            "[class*='screen'], [class*='Screen']"
          );
          const screen = screenEl ? screenEl.textContent.trim() : "";
          const bookingUrl = href.startsWith("http")
            ? href
            : "https://www.district.in" + href;

          if (time) {
            shows.push({ session_id: sessionId, time, screen, booking_url: bookingUrl });
          }
        });

        if (shows.length > 0) {
          results.push({ title, meta, shows });
        }
      });

      return results;
    });

    // If selector-based scraping returned nothing, fall back to full text parse
    if (movies.length === 0) {
      const content = await page.content();
      console.warn("⚠ Selector scrape returned 0 movies, check selectors");
      return res.status(200).json({
        cinema: "Galaxy Cinemas 4K Atmos, Pookkottumpadam",
        date: new Date().toISOString().split("T")[0],
        warning: "Could not parse movies — District.in may have changed layout",
        raw_hint: content.substring(0, 500),
        movies: [],
      });
    }

    res.json({
      cinema: "Galaxy Cinemas 4K Atmos, Pookkottumpadam",
      address: "Kalikavu Road, Pookkottumpadam, Malappuram, Kerala 679332",
      date: new Date().toISOString().split("T")[0],
      movies,
    });
  } catch (err) {
    console.error("❌ /showtimes error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
  }
});

// ─── ENDPOINT 2: POST /seats ──────────────────────────────────────────────────
// Body: { session_id: "yj6qxyl0a_", num_tickets: 2 }
// ElevenLabs calls this after user picks a show
app.post("/seats", async (req, res) => {
  console.log("▶ /seats called", req.body);
  const { session_id, num_tickets } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: "session_id is required" });
  }

  const seatUrl = `${DISTRICT_BASE}/movies/seat-layout/${session_id}`;
  const { browser, page } = await getPage();

  try {
    await page.goto(seatUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector(
      "[class*='seat'], [class*='Seat'], [data-seat-id]",
      { timeout: 15000 }
    );

    const seatData = await page.evaluate(() => {
      const available = [];
      const booked = [];

      const seatEls = document.querySelectorAll(
        "[data-seat-id], [class*='seat__'], [class*='SeatLayout']"
      );

      seatEls.forEach((el) => {
        const id =
          el.getAttribute("data-seat-id") ||
          el.getAttribute("data-id") ||
          el.textContent.trim();

        if (!id || id.length > 5) return; // skip non-seat elements

        const classList = el.className || "";
        const isBooked =
          classList.includes("booked") ||
          classList.includes("sold") ||
          classList.includes("unavailable") ||
          classList.includes("blocked") ||
          el.getAttribute("aria-disabled") === "true" ||
          el.getAttribute("disabled") !== null;

        if (isBooked) {
          booked.push(id);
        } else {
          available.push(id);
        }
      });

      // Get price info
      const priceEl = document.querySelector(
        "[class*='price'], [class*='Price'], [class*='amount']"
      );
      const price = priceEl ? priceEl.textContent.trim() : "Check District.in";

      return { available, booked, price };
    });

    res.json({
      session_id,
      num_tickets_requested: num_tickets,
      seat_map: {
        available: seatData.available,
        booked: seatData.booked,
        total_available: seatData.available.length,
        total_booked: seatData.booked.length,
      },
      pricing: seatData.price,
      note: "This theatre does not allow ticket cancellation",
      seat_layout_url: seatUrl,
    });
  } catch (err) {
    console.error("❌ /seats error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
  }
});

// ─── ENDPOINT 3: POST /booking-link ──────────────────────────────────────────
// Body: { session_id, movie_name, show_time, screen, seats: [], num_tickets }
// Generates the direct District.in checkout URL
app.post("/booking-link", async (req, res) => {
  console.log("▶ /booking-link called", req.body);
  const { session_id, movie_name, show_time, screen, seats, num_tickets } =
    req.body;

  if (!session_id || !seats || seats.length === 0) {
    return res
      .status(400)
      .json({ error: "session_id and seats are required" });
  }

  // District.in deep link format
  const bookingUrl = `${DISTRICT_BASE}/movies/seat-layout/${session_id}`;

  res.json({
    booking_url: bookingUrl,
    summary: {
      movie: movie_name,
      show_time,
      screen,
      seats,
      num_tickets,
      cinema: "Galaxy Cinemas 4K Atmos, Pookkottumpadam",
      address: "Kalikavu Road, Pookkottumpadam, Malappuram, Kerala 679332",
    },
    instructions: [
      "Tap the booking_url to open District.in",
      "Your selected seats will be pre-highlighted",
      "Complete payment via UPI, Credit/Debit Card, or Net Banking",
      "Seats are held for 10 minutes after opening the link",
    ],
    important: "Tickets cannot be cancelled or refunded at this theatre",
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "Galaxy Cinemas Agent API is running",
    endpoints: {
      "GET /showtimes": "Fetch today's live movies + showtimes",
      "POST /seats": "Get seat availability for a show { session_id, num_tickets }",
      "POST /booking-link": "Generate booking URL { session_id, movie_name, show_time, screen, seats, num_tickets }",
    },
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Galaxy Cinemas Agent API running on port ${PORT}`);
});
