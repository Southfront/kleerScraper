# kleerScraper

A Node.js utility for accessing and extracting time reporting data from Kleer.

## Description

kleerScraper provides a simple way to extract time reporting data from the Kleer time reporting system. It features:

- Authentication with Kleer credentials
- Extraction of time reporting data for a specific year
- Summary of work hours, events, and holidays
- Quarterly breakdowns of reported hours and events
- Detailed data export to JSON format

## Installation

Make sure you have [Node.js](https://nodejs.org/) installed, then set up the project:

```bash
# Clone the repository (if not done already)
git clone https://your-repository-url/kleerScraper.git
cd kleerScraper

# Install dependencies
npm install
```

## Usage

### One Step Data Extraction

The simplest way to use kleerScraper is with the one-step script:

```bash
node kleerOneStep.js <username> <password> [year] [outputFilePath]
```

Parameters:

- `username`: Your Kleer username (email)
- `password`: Your Kleer password
- `year`: (Optional) The year to fetch data for (defaults to current year)
- `outputFilePath`: (Optional) Path where to save the JSON file

Example:

```bash
node kleerOneStep.js user@example.com myPassword 2025 ./kleer-data-2025.json
```

### API Usage

You can also use the module in your own scripts:

```javascript
import getKleerYearDataWithCredentials from "./kleerOneStep.js";

const username = "user@example.com";
const password = "myPassword";
const year = 2025;
const outputPath = "./kleer-data-2025.json";

getKleerYearDataWithCredentials(username, password, year, outputPath)
  .then((data) => {
    console.log("Data fetched successfully!");
    // Use the data here
  })
  .catch((error) => {
    console.error("Error fetching data:", error.message);
  });
```

## Project Structure

- `kleerOneStep.js` - Main script for one-step data extraction
- `kleerApi.js` - API module with more granular functions
- `package.json` - Project dependencies and settings

## Data Format

The output JSON file contains:

- Summary with total hours (scheduled and reported)
- List of events with hours and days
- List of holidays
- Quarterly breakdowns
- Monthly data with details for each day

## Requirements

- Node.js 14.0 or higher
- ES Modules support
- Internet connection to access Kleer servers

## Note

This tool is for personal use only. Please respect Kleer's terms of service when using this tool.
