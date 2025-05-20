import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Grid,
  Paper,
  Typography,
  Box,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
} from '@mui/material';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import axios from 'axios';
import * as tf from '@tensorflow/tfjs';
import { RSI, SMA } from 'technicalindicators';

interface CryptocurrencyData {
  id: string;
  name: string;
  symbol: string;
  market_data: {
    current_price: {
      usd: number;
    };
    price_change_percentage_24h: number;
    market_cap: {
      usd: number;
    };
  };
}

interface ChartData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const CryptocurrencyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [cryptoData, setCryptoData] = useState<CryptocurrencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('30');
  const [prediction, setPrediction] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    const fetchCryptoData = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/cryptocurrency/${id}`);
        setCryptoData(response.data);
        setLoading(false);
      } catch (error: any) {
        console.error('Error fetching cryptocurrency data:', error);
        setError(error.response?.data?.error || 'Failed to fetch cryptocurrency data');
        setLoading(false);
      }
    };

    fetchCryptoData();
  }, [id]);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/cryptocurrency/${id}/history`, {
          params: { days: timeframe }
        });
        
        if (candlestickSeriesRef.current) {
          candlestickSeriesRef.current.setData(response.data);
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(response.data.map((d: CandlestickData) => ({
            time: d.time,
            value: d.volume
          })));
        }

        // Calculate technical indicators
        const closes = response.data.map((d: CandlestickData) => d.close);
        const rsi = RSI.calculate({
          values: closes,
          period: 14
        });
        const sma = SMA.calculate({
          values: closes,
          period: 20
        });

        // Prepare data for prediction
        const lastPrices = closes.slice(-30);
        const prediction = await predictNextPrice(lastPrices);
        setPrediction(prediction);

      } catch (error: any) {
        console.error('Error fetching chart data:', error);
        setError(error.response?.data?.error || 'Failed to fetch chart data');
      }
    };

    fetchChartData();
  }, [id, timeframe]);

  const predictNextPrice = async (prices: number[]): Promise<number> => {
    try {
      // Normalize the data
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const normalizedPrices = prices.map(p => (p - min) / (max - min));

      // Create sequences for training
      const sequenceLength = 5;
      const sequences = [];
      const targets = [];

      for (let i = 0; i < normalizedPrices.length - sequenceLength; i++) {
        sequences.push(normalizedPrices.slice(i, i + sequenceLength));
        targets.push(normalizedPrices[i + sequenceLength]);
      }

      // Create and train a simple model
      const model = tf.sequential();
      model.add(tf.layers.lstm({
        units: 50,
        returnSequences: false,
        inputShape: [sequenceLength, 1]
      }));
      model.add(tf.layers.dense({ units: 1 }));

      model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'meanSquaredError'
      });

      // Prepare data for training
      const xs = tf.tensor3d(sequences.map(seq => seq.map(x => [x])));
      const ys = tf.tensor2d(targets.map(t => [t]));

      // Train the model
      await model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        verbose: 0
      });

      // Make prediction
      const lastSequence = normalizedPrices.slice(-sequenceLength);
      const predictionInput = tf.tensor3d([lastSequence.map(x => [x])]);
      const prediction = model.predict(predictionInput) as tf.Tensor;
      const predictedValue = await prediction.data();

      // Denormalize the prediction
      const denormalizedPrediction = predictedValue[0] * (max - min) + min;

      return denormalizedPrediction;
    } catch (error) {
      console.error('Error making prediction:', error);
      return 0;
    }
  };

  useEffect(() => {
    if (chartContainerRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#1e1e1e' },
          textColor: '#d1d4dc',
        },
        grid: {
          vertLines: { color: '#2B2B43' },
          horzLines: { color: '#2B2B43' },
        },
        width: chartContainerRef.current.clientWidth,
        height: 400,
      });

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
        priceScale: {
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        },
      });

      candlestickSeriesRef.current = candlestickSeries;
      volumeSeriesRef.current = volumeSeries;
      chartRef.current = chart;

      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    }
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      </Container>
    );
  }

  if (!cryptoData) {
    return (
      <Container>
        <Typography variant="h5" color="error">
          Cryptocurrency not found
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <Typography variant="h4" component="h1">
                {cryptoData.name} ({cryptoData.symbol.toUpperCase()})
              </Typography>
            </Box>
            <Typography variant="h5" color="primary" gutterBottom>
              ${cryptoData.market_data.current_price.usd.toLocaleString()}
            </Typography>
            <Typography
              color={cryptoData.market_data.price_change_percentage_24h >= 0 ? 'success.main' : 'error.main'}
            >
              24h Change: {cryptoData.market_data.price_change_percentage_24h.toFixed(2)}%
            </Typography>
            {prediction && (
              <Typography variant="h6" color="info.main" sx={{ mt: 2 }}>
                AI Prediction (Next Day): ${prediction.toFixed(2)}
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box mb={2}>
              <ToggleButtonGroup
                value={timeframe}
                exclusive
                onChange={(e, value) => value && setTimeframe(value)}
              >
                <ToggleButton value="7">7D</ToggleButton>
                <ToggleButton value="30">1M</ToggleButton>
                <ToggleButton value="90">3M</ToggleButton>
                <ToggleButton value="180">6M</ToggleButton>
                <ToggleButton value="365">1Y</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <div ref={chartContainerRef} style={{ width: '100%', height: 400 }} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Market Statistics
            </Typography>
            <Typography>
              Market Cap: ${cryptoData.market_data.market_cap.usd.toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default CryptocurrencyDetail; 