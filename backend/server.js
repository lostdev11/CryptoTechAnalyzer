const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const NodeCache = require('node-cache');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize cache with 5 minutes TTL
const cache = new NodeCache({ stdTTL: 300 });

app.use(cors());
app.use(express.json());

// CoinGecko API base URL
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Rate limiting middleware
const rateLimit = {
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many requests, please try again later.'
};

const requestCounts = new Map();

const rateLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowStart = now - rateLimit.windowMs;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const requests = requestCounts.get(ip);
  const validRequests = requests.filter(time => time > windowStart);
  requestCounts.set(ip, validRequests);

  if (validRequests.length >= rateLimit.max) {
    return res.status(429).json({ error: rateLimit.message });
  }

  validRequests.push(now);
  next();
};

// Routes
app.get('/api/cryptocurrencies', rateLimiter, async (req, res) => {
  try {
    const cacheKey = 'cryptocurrencies';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const response = await axios.get(`${COINGECKO_API}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 100,
        page: 1,
        sparkline: false
      }
    });

    cache.set(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching cryptocurrencies:', error);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch cryptocurrency data',
      details: error.response?.data || error.message
    });
  }
});

app.get('/api/cryptocurrency/:id', rateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `crypto_${id}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const response = await axios.get(`${COINGECKO_API}/coins/${id}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false
      }
    });

    cache.set(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching cryptocurrency details:', error);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch cryptocurrency details',
      details: error.response?.data || error.message
    });
  }
});

app.get('/api/cryptocurrency/:id/history', rateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = '30' } = req.query;
    const cacheKey = `history_${id}_${days}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const response = await axios.get(`${COINGECKO_API}/coins/${id}/market_chart`, {
      params: {
        vs_currency: 'usd',
        days: days,
        interval: 'daily'
      }
    });

    // Transform the data into candlestick format
    const prices = response.data.prices;
    const volumes = response.data.total_volumes;
    const candlestickData = [];

    for (let i = 0; i < prices.length; i++) {
      const timestamp = new Date(prices[i][0]).toISOString().split('T')[0];
      const price = prices[i][1];
      const volume = volumes[i][1];

      if (i > 0) {
        const prevPrice = prices[i - 1][1];
        candlestickData.push({
          time: timestamp,
          open: prevPrice,
          high: Math.max(prevPrice, price),
          low: Math.min(prevPrice, price),
          close: price,
          volume: volume
        });
      }
    }

    cache.set(cacheKey, candlestickData);
    res.json(candlestickData);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch historical price data',
      details: error.response?.data || error.message
    });
  }
});

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('subscribe', (coinId) => {
    socket.join(coinId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 