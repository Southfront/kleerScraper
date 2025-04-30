import express from "express";
import cors from "cors";
import getKleerYearDataWithCredentials from "./kleerOneStep.js";

const app = express();
const port = process.env.PORT || 3001;

// Öka storleksgränsen för JSON-förfrågningar
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Aktivera CORS för din React-app
app.use(
  cors({
    origin: "*",
    methods: ["POST"],
    credentials: true,
    exposedHeaders: ["Content-Length", "Content-Type"],
  })
);

// API-endpoint för att hämta Kleer-data
app.post("/api/kleer/year-data", async (req, res) => {
  try {
    const { username, password, year } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Användarnamn och lösenord krävs" });
    }

    const yearToFetch = year || new Date().getFullYear();
    console.log(`Hämtar data för år ${yearToFetch}...`);

    // Anropa funktionen från kleerOneStep.js UTAN att spara till fil
    const data = await getKleerYearDataWithCredentials(
      username,
      password,
      parseInt(yearToFetch),
      null // Ingen filsökväg - använd inte temporära filer
    );

    console.log("Data hämtad från Kleer API");
    console.log("- Months:", data.months ? data.months.length : 0);
    console.log("- Summary:", !!data.summary);

    // Skicka data direkt utan att gå via filen
    res.json(data);
  } catch (error) {
    console.error("Error fetching Kleer data:", error.message);
    res.status(500).json({
      error: "Kunde inte hämta data från Kleer",
      message: error.message,
    });
  }
});

// Enkel healthcheck-endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", time: new Date().toISOString() });
});

// Starta servern
app.listen(port, () => {
  console.log(`Kleer API server körs på http://localhost:${port}`);
});
