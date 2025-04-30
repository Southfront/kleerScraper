import axios from "axios";
import querystring from "querystring";
import fs from "fs/promises";

/**
 * Decode a token string (which might be a JWT or other format)
 * @param {string} token - The token to decode
 * @returns {Object|null} Decoded token data or null if unable to decode
 */
function decodeToken(token) {
  try {
    // Check if the token contains a period and only use the part before it
    const tokenToDecode = token.includes(".") ? token.split(".")[0] : token;

    // First try as JWT (format: header.payload.signature)
    if (tokenToDecode.includes(".")) {
      const parts = tokenToDecode.split(".");
      if (parts.length >= 2) {
        // JWT payload is the second part
        const payload = parts[1];
        // Base64 decode the payload
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
        return JSON.parse(jsonPayload);
      }
    }

    // If not JWT format, try base64 decode directly
    try {
      const decoded = Buffer.from(tokenToDecode, "base64").toString("utf8");
      // If it looks like JSON, parse it
      if (decoded.startsWith("{") && decoded.endsWith("}")) {
        return JSON.parse(decoded);
      }
      return { raw: decoded }; // Return raw decoded string
    } catch (e) {
      // Not base64 or not valid JSON, return as-is
      return { raw: tokenToDecode };
    }
  } catch (error) {
    console.error("Error decoding token:", error.message);
    return null;
  }
}

/**
 * Loggar in på Kleer och returnerar autentiseringstoken
 * @param {string} username - Användarnamn för Kleer
 * @param {string} password - Lösenord för Kleer
 * @returns {Promise<string>} Auth token värdet
 */
async function loginAndGetAuthToken(username, password) {
  if (!username || !password) {
    throw new Error(
      "Både användarnamn och lösenord krävs för att logga in med axios"
    );
  }

  try {
    // Exakt URL från cURL-anropet
    const loginUrl =
      "https://my.kleer.se/web2/login?_data=routes%2F_public%2B%2Flogin";

    // Förbered requestdata exakt som i cURL-anropet
    const loginData = querystring.stringify({
      email: username,
      password: password,
      redirectTo: "/web2/dashboard",
    });

    // Gör inloggningsförfrågan med exakt samma headers som i cURL-anropet
    const response = await axios.post(loginUrl, loginData, {
      headers: {
        Accept: "*/*",
        "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Origin: "https://my.kleer.se",
        Pragma: "no-cache",
        Referer: "https://my.kleer.se/web2/login",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "sec-ch-ua":
          '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
    });

    // Kontrollera att inloggningen lyckades
    if (response.status !== 200 && response.status !== 204) {
      throw new Error(
        `Inloggning misslyckades med statuskod: ${response.status}`
      );
    }

    // Hämta cookies från svaret
    const cookies = response.headers["set-cookie"];
    if (!cookies || cookies.length === 0) {
      throw new Error("Inga cookies returnerades från inloggningssvaret");
    }

    // Leta efter __auth2 cookie eller annan relevant autentiseringstoken
    const authCookieStr = cookies.find((cookie) => cookie.includes("__auth2="));
    if (!authCookieStr) {
      throw new Error("Auth cookie hittades inte i svaret");
    }

    // Extrahera värdet från cookien
    const authCookieMatch = authCookieStr.match(/__auth2=([^;]+)/);
    if (!authCookieMatch || !authCookieMatch[1]) {
      throw new Error("Kunde inte extrahera värdet från auth cookie");
    }

    const token = authCookieMatch[1];

    // Avkoda token och kontrollera om den innehåller felmeddelande
    const decodedToken = decodeToken(token);
    if (decodedToken) {
      // Kontrollera om den avkodade token innehåller felmeddelande om inloggning
      if (
        decodedToken.raw &&
        typeof decodedToken.raw === "string" &&
        decodedToken.raw.includes("Felaktig e-postadress och/eller lösenord")
      ) {
        throw new Error(
          "Inloggning misslyckades: Felaktig e-postadress och/eller lösenord"
        );
      }

      // Om vi har ett message-fält i den avkodade token
      if (
        decodedToken.message &&
        typeof decodedToken.message === "string" &&
        decodedToken.message.includes(
          "Felaktig e-postadress och/eller lösenord"
        )
      ) {
        throw new Error(
          "Inloggning misslyckades: Felaktig e-postadress och/eller lösenord"
        );
      }

      // Sök efter fält 'message' i eventuella nestlade objekt i token
      const checkForErrorMessage = (obj) => {
        if (obj && typeof obj === "object") {
          for (const [key, value] of Object.entries(obj)) {
            if (
              key === "message" &&
              typeof value === "string" &&
              value.includes("Felaktig e-postadress och/eller lösenord")
            ) {
              throw new Error(
                "Inloggning misslyckades: Felaktig e-postadress och/eller lösenord"
              );
            }
            if (value && typeof value === "object") {
              checkForErrorMessage(value);
            }
          }
        }
      };

      // Kontrollera alla objekt i token för felmeddelande
      checkForErrorMessage(decodedToken);
    }

    return token;
  } catch (error) {
    console.error("Error under inloggningsförsöket:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);

      // Kontrollera om svaret innehåller ett felmeddelande om felaktig inloggning
      if (error.response.data && error.response.data.message) {
        if (
          error.response.data.message.includes(
            "Felaktig e-postadress och/eller lösenord"
          )
        ) {
          throw new Error(
            "Inloggning misslyckades: Felaktig e-postadress och/eller lösenord"
          );
        }
        console.error("Response message:", error.response.data.message);
      } else {
        console.error("Response data:", error.response.data);
      }
    }
    throw error;
  }
}

/**
 * Processes the response data by combining all days from all weeks into a flat array
 * @param {Object} data - The response data containing weeks array
 * @param {number} year - The year to filter days for
 * @returns {Array} - Flat array of all days from the specified year
 */
function processMonthResponse(data, year) {
  if (!data || !data.weeks || !Array.isArray(data.weeks)) {
    return [];
  }
  console.log("Processing month response...", data);
  // Extract all days from all weeks into a flat array
  const allDays = data.weeks.reduce((acc, week) => {
    if (week.days && Array.isArray(week.days)) {
      // Add week number to each day for reference
      const daysWithWeekNum = week.days.map((day) => ({
        ...day,
        weekNumber: week.weekNumber,
        weekYear: week.weekYear,
      }));
      acc.push(...daysWithWeekNum);
    }
    return acc;
  }, []);

  // Filter out days that don't belong to the requested year
  const filteredDays = allDays.filter((day) => day.year === year);
  return {
    days: filteredDays,
    totalScheduledHours: data.weeks.reduce(
      (acc, week) => acc + (week.scheduledHours || 0),
      0
    ),
    totalReportedHours: data.weeks.reduce(
      (acc, week) => acc + (week.reportedHours || 0),
      0
    ),
  };
}

/**
 * Fetches data for a specific year and month
 * @param {string} token - Auth token för Kleer
 * @param {number} year - The year to fetch data for
 * @param {number} month - The month to fetch data for (1-12)
 * @returns {Promise<Object>} - The processed response data
 */
async function fetchMonthData(token, year, month) {
  try {
    const url = `https://my.kleer.se/web2/time-reporting/month/${year}/${month}?_data=routes%2F_secure._app%2B%2Ftime-reporting%2B%2Fmonth.%28%24year%29.%28%24month%29._index`;

    const headers = {
      Accept: "*/*",
      "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7,nb;q=0.6",
      Connection: "keep-alive",
      Cookie: `__auth2=${token}; CH-prefers-color-scheme=light`,
      Referer: "https://my.kleer.se/web2/time-reporting/month",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "sec-ch-ua":
        '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    };

    const response = await axios.get(url, { headers });

    console.log(`✓ Hämtade data för ${year}-${String(month).padStart(2, "0")}`);

    // Process the response to create a flat list of days, filtering by year
    const processedData = processMonthResponse(response.data, year);

    // Add year and month to the result for reference
    return {
      year,
      month,
      ...processedData,
    };
  } catch (error) {
    console.error(
      `Fel vid hämtning av data för ${year}-${month}:`,
      error.message
    );
    return null;
  }
}

/**
 * Fetches vacation data from the dashboard API
 * @param {string} token - Auth token för Kleer
 * @param {number} year - The year to fetch data for
 * @returns {Promise<Object>} - The vacation data
 */
async function fetchVacationData(token, year) {
  try {
    const url =
      "https://my.kleer.se/web2/dashboard?_data=routes%2F_secure._app%2B%2Fdashboard";

    const headers = {
      Accept: "*/*",
      "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7,nb;q=0.6",
      Connection: "keep-alive",
      Cookie: `__auth2=${token}; CH-prefers-color-scheme=light`,
      Referer: "https://my.kleer.se/web2/dashboard",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "sec-ch-ua":
        '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    };

    console.log(`Hämtar semesterdata för år ${year}...`);
    const response = await axios.get(url, { headers });

    if (!response.data || !response.data.vacation) {
      console.warn("Varning: Ingen semesterdata hittades i svaret");
      return null;
    }

    console.log("✓ Semesterdata hämtad");
    return response.data.vacation;
  } catch (error) {
    console.error(`Fel vid hämtning av semesterdata:`, error.message);
    return null;
  }
}

/**
 * Fetches monthly data for a range of months
 * @param {string} token - Auth token för Kleer
 * @param {number} startYear - The year to start fetching from
 * @param {number} startMonth - The month to start fetching from (1-12)
 * @param {number} endYear - The year to end fetching at
 * @param {number} endMonth - The month to end fetching at (1-12)
 * @returns {Promise<Array>} - Array of processed month data
 */
async function fetchMonthsRange(
  token,
  startYear,
  startMonth,
  endYear,
  endMonth
) {
  const allResults = [];

  // Calculate total number of months to fetch
  const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth + 1);

  // Create array of all month/year combinations to fetch
  const monthsToFetch = [];
  let currentYear = startYear;
  let currentMonth = startMonth;

  for (let i = 0; i < totalMonths; i++) {
    monthsToFetch.push({ year: currentYear, month: currentMonth });

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  // Fetch data for all months in parallel
  const promises = monthsToFetch.map(({ year, month }) =>
    fetchMonthData(token, year, month)
  );
  const results = await Promise.all(promises);

  // Filter out null results
  return results.filter((result) => result !== null);
}

/**
 * Gets holiday data for a specific year
 * @param {string} token - Auth token för Kleer
 * @param {number} year - The year to fetch data for
 * @returns {Promise<Array>} - Array of processed month data
 */
async function getYearHolidays(token, year) {
  return fetchMonthsRange(token, year, 1, year, 12);
}

/**
 * Generates a summary of the year's data
 * @param {Array} monthsData - Array of monthly data
 * @returns {Object} - Summary object with totals, lists and quarterly data
 */
function generateYearSummary(monthsData) {
  let totalScheduledHours = 0;
  let totalReportedHours = 0;
  const events = {};
  const holidays = [];
  const holidaysByName = {};

  // Initialize quarterly data
  const quarters = {
    Q1: {
      months: [1, 2, 3],
      totalScheduledHours: 0,
      totalReportedHours: 0,
      events: {},
    },
    Q2: {
      months: [4, 5, 6],
      totalScheduledHours: 0,
      totalReportedHours: 0,
      events: {},
    },
    Q3: {
      months: [7, 8, 9],
      totalScheduledHours: 0,
      totalReportedHours: 0,
      events: {},
    },
    Q4: {
      months: [10, 11, 12],
      totalScheduledHours: 0,
      totalReportedHours: 0,
      events: {},
    },
  };

  // Process each month
  monthsData.forEach((month) => {
    // Add month totals to year summary
    totalScheduledHours += month.totalScheduledHours || 0;
    totalReportedHours += month.totalReportedHours || 0;

    // Determine which quarter this month belongs to
    let currentQuarter = null;
    for (const [quarter, data] of Object.entries(quarters)) {
      if (data.months.includes(month.month)) {
        currentQuarter = quarter;
        // Add month totals to quarterly summary
        quarters[quarter].totalScheduledHours += month.totalScheduledHours || 0;
        quarters[quarter].totalReportedHours += month.totalReportedHours || 0;
        break;
      }
    }

    // Process each day in the month
    month.days.forEach((day) => {
      // Count event hours
      if (day.events && Array.isArray(day.events)) {
        day.events.forEach((event) => {
          const eventName = event.name;

          // Add to yearly events summary
          if (!events[eventName]) {
            events[eventName] = {
              name: eventName,
              hours: 0,
              days: 0,
            };
          }
          events[eventName].hours += day.reportedHours || 0;
          events[eventName].days += 1;

          // Add to quarterly events summary
          if (currentQuarter) {
            if (!quarters[currentQuarter].events[eventName]) {
              quarters[currentQuarter].events[eventName] = {
                name: eventName,
                hours: 0,
                days: 0,
              };
            }
            quarters[currentQuarter].events[eventName].hours +=
              day.reportedHours || 0;
            quarters[currentQuarter].events[eventName].days += 1;
          }
        });
      }

      // Collect holidays - only if the day has no scheduled hours
      if (day.holiday && day.scheduledHours === 0) {
        const holidayName = day.holiday.name;
        if (!holidaysByName[holidayName]) {
          holidaysByName[holidayName] = true;
          holidays.push({
            name: holidayName,
            date: day.date,
            type: day.holiday.type,
            iconName: day.holiday.iconName || null,
          });
        }
      }
    });
  });

  // Convert events object to array for year summary
  const eventsList = Object.values(events).sort((a, b) => b.hours - a.hours);

  // Convert quarterly events objects to arrays
  for (const quarter in quarters) {
    quarters[quarter].events = Object.values(quarters[quarter].events).sort(
      (a, b) => b.hours - a.hours
    );
  }

  return {
    summary: {
      year: monthsData[0]?.year || new Date().getFullYear(),
      totalScheduledHours,
      totalReportedHours,
      events: eventsList,
      holidays: holidays.sort((a, b) => new Date(a.date) - new Date(b.date)),
      quarters: {
        Q1: {
          totalScheduledHours: quarters.Q1.totalScheduledHours,
          totalReportedHours: quarters.Q1.totalReportedHours,
          events: quarters.Q1.events,
        },
        Q2: {
          totalScheduledHours: quarters.Q2.totalScheduledHours,
          totalReportedHours: quarters.Q2.totalReportedHours,
          events: quarters.Q2.events,
        },
        Q3: {
          totalScheduledHours: quarters.Q3.totalScheduledHours,
          totalReportedHours: quarters.Q3.totalReportedHours,
          events: quarters.Q3.events,
        },
        Q4: {
          totalScheduledHours: quarters.Q4.totalScheduledHours,
          totalReportedHours: quarters.Q4.totalReportedHours,
          events: quarters.Q4.events,
        },
      },
    },
  };
}

/**
 * Remove specified properties from each day object
 * @param {Array} monthsData - Array of monthly data
 * @returns {Array} - Cleaned monthly data
 */
function cleanDayProperties(monthsData) {
  return monthsData.map((month) => {
    const cleanedDays = month.days.map((day) => {
      if (!day) return day;

      // Create a new object without the specified properties
      const {
        isToday,
        isWeekend,
        isSelectedMonth,
        hasMoreEvents,
        numberOfHiddenEvents,
        ...cleanedDay
      } = day;

      return cleanedDay;
    });

    return {
      ...month,
      days: cleanedDays,
    };
  });
}

/**
 * Huvudfunktion för att logga in och hämta årsdata i ett och samma anrop
 * @param {string} username - Användarnamn för Kleer
 * @param {string} password - Lösenord för Kleer
 * @param {number} year - Året att hämta data för
 * @param {string} outputPath - Sökvägen där JSON-filen ska sparas
 * @returns {Promise<Object>} - JSON-objektet med årsdata
 */
async function getKleerYearDataWithCredentials(
  username,
  password,
  year,
  outputPath
) {
  try {
    console.log(`Loggar in på Kleer med användare ${username}...`);
    // Logga in och få auth-token direkt från inloggningssvaret
    const token = await loginAndGetAuthToken(username, password);
    console.log("✓ Inloggning lyckades, token hämtad");

    console.log(`Hämtar data för år ${year}...`);
    // Använd token för att hämta årsdata
    const monthsData = await getYearHolidays(token, year);

    if (!monthsData || monthsData.length === 0) {
      throw new Error(`Kunde inte hämta data för år ${year}`);
    }

    // Hämta semesterdata från dashboard
    const vacationData = await fetchVacationData(token, year);

    // Filter each month to only include days that belong to that month
    const filteredMonthsData = monthsData.map((monthObj) => {
      // Ensure days array exists
      if (!monthObj.days || !Array.isArray(monthObj.days)) {
        console.warn(`Varning: Inga dagar för månad ${monthObj.month}`);
        monthObj.days = [];
        return monthObj;
      }

      // Extract month from date string (date format is YYYY-MM-DD)
      const filteredDays = monthObj.days.filter((day) => {
        if (!day || !day.date) return false;

        // Extract the month from the date (date format is YYYY-MM-DD)
        const dateMonth = parseInt(day.date.split("-")[1], 10);

        // Keep only if month in date matches the month object's month property
        return dateMonth === monthObj.month;
      });

      return {
        ...monthObj,
        days: filteredDays,
      };
    });

    // Clean day properties before generating summary
    const cleanedMonthsData = cleanDayProperties(filteredMonthsData);

    // Generate year summary (which includes events and holidays)
    const yearSummary = generateYearSummary(cleanedMonthsData);

    if (!yearSummary.summary || !yearSummary.summary.events) {
      console.warn(
        "Varning: Events saknas i sammanfattningen, genererar dem manuellt"
      );

      // Samla events manuellt om de saknas
      const events = {};
      cleanedMonthsData.forEach((month) => {
        month.days.forEach((day) => {
          if (day.events && Array.isArray(day.events)) {
            day.events.forEach((event) => {
              const eventName = event.name;
              if (!events[eventName]) {
                events[eventName] = { name: eventName, hours: 0, days: 0 };
              }
              events[eventName].hours += day.reportedHours || 0;
              events[eventName].days += 1;
            });
          }
        });
      });

      if (!yearSummary.summary) yearSummary.summary = { year: year };
      yearSummary.summary.events = Object.values(events).sort(
        (a, b) => b.hours - a.hours
      );
    }

    if (!yearSummary.summary || !yearSummary.summary.holidays) {
      console.warn(
        "Varning: Helgdagar saknas i sammanfattningen, genererar dem manuellt"
      );

      // Samla helgdagar manuellt om de saknas
      const holidays = [];
      const holidaysByName = {};

      cleanedMonthsData.forEach((month) => {
        month.days.forEach((day) => {
          if (day.holiday && day.scheduledHours === 0) {
            const holidayName = day.holiday.name;
            if (!holidaysByName[holidayName]) {
              holidaysByName[holidayName] = true;
              holidays.push({
                name: holidayName,
                date: day.date,
                type: day.holiday.type,
                iconName: day.holiday.iconName || null,
              });
            }
          }
        });
      });

      if (!yearSummary.summary) yearSummary.summary = { year: year };
      yearSummary.summary.holidays = holidays.sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );
    }

    // Combine summary with filtered data
    const finalData = {
      ...yearSummary,
      months: cleanedMonthsData,
    };

    // Double-check that the required data structures exist
    if (!finalData.summary) {
      finalData.summary = {
        year: year,
        totalScheduledHours: 0,
        totalReportedHours: 0,
        events: [],
        holidays: [],
      };
    }

    // Lägg till semesterdata i sammanfattningen
    if (vacationData) {
      finalData.summary.vacation = vacationData;
      console.log("✓ Semesterdata lagd till i sammanfattningen");
    } else {
      console.warn(
        "Varning: Ingen semesterdata att lägga till i sammanfattningen"
      );
      finalData.summary.vacation = null;
    }

    if (!finalData.summary.events) finalData.summary.events = [];
    if (!finalData.summary.holidays) finalData.summary.holidays = [];
    if (!finalData.months) finalData.months = [];

    // Verify that months have days arrays
    finalData.months = finalData.months.map((month) => {
      if (!month.days || !Array.isArray(month.days)) {
        month.days = [];
      }
      return month;
    });

    // Om en sökväg angavs, spara datan till fil
    if (outputPath) {
      console.log(`Skriver data till ${outputPath}...`);
      await fs.writeFile(
        outputPath,
        JSON.stringify(finalData, null, 2),
        "utf8"
      );
      console.log(`✅ JSON-fil skapad framgångsrikt: ${outputPath}`);
    }

    return finalData;
  } catch (error) {
    console.error("❌ Fel vid hämtning av årsdata:", error.message);
    throw error;
  }
}

// Om skriptet körs direkt (inte importeras)
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const username = process.argv[2] || "";
  const password = process.argv[3] || "";
  const year = parseInt(process.argv[4] || new Date().getFullYear());
  const outputPath = process.argv[5] || "kleerData.json";

  if (!username || !password) {
    console.error("❌ Både användarnamn och lösenord måste anges som argument");
    console.log(
      "Användning: node kleerOneStep.js <användarnamn> <lösenord> [år] [utdatafil]"
    );
    process.exit(1);
  }

  getKleerYearDataWithCredentials(username, password, year, outputPath)
    .then(() => {
      console.log("✅ Klart!");
    })
    .catch((error) => {
      console.error("❌ Fel:", error.message);
      process.exit(1);
    });
}

export default getKleerYearDataWithCredentials;
