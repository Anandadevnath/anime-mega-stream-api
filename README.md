# Anime Scraper API

A Node.js Express API for scraping, storing, and managing anime and streaming links.

## Features

- Scrape anime lists and details from external sources
- Store anime and streaming links in MongoDB
- Retrieve, search, and delete anime and streaming links
- Batch and paginated scraping
- RESTful endpoints for easy integration

## Endpoints

### Normal Endpoints

| Endpoint | Description |
|----------|-------------|
| `/hianime-top10` | Get HiAnime top 10 trending anime |
| `/hianime-weekly-top10` | Get HiAnime weekly top 10 anime |
| `/hianime-monthly-top10` | Get HiAnime monthly top 10 anime |

### Database Endpoints

| Endpoint | Description |
|----------|-------------|
| `/db/anime-list?page=1` | Paginated list of all anime in the database |
| `/db/streaming-links` | Paginated list of all streaming links in the database |
| `/db/single-streaming-links` | Paginated list of single streaming links in the database |
| `/db/anime-details?id=your-forma` | Get all streaming links for a specific anime from the database |
| `/db/stats` | Database statistics |

## Usage

- **Start the server:**  
  `npm start` or `nodemon index.js`

- **Delete anime streaming links:**  
  Send a DELETE request to  
  `http://localhost:5000/remove-anime?id=anime-title`

- **Get API documentation:**  
  Visit `http://localhost:5000/` in your browser.

##
