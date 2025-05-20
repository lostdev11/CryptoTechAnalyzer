import React, { useEffect, useState } from 'react';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Box,
  CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface Cryptocurrency {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number;
  image: string;
}

const Dashboard: React.FC = () => {
  const [cryptocurrencies, setCryptocurrencies] = useState<Cryptocurrency[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCryptocurrencies = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/cryptocurrencies');
        setCryptocurrencies(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching cryptocurrencies:', error);
        setLoading(false);
      }
    };

    fetchCryptocurrencies();
  }, []);

  const filteredCryptocurrencies = cryptocurrencies.filter((crypto) =>
    crypto.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <TextField
        fullWidth
        label="Search Cryptocurrencies"
        variant="outlined"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 4 }}
      />
      <Grid container spacing={3}>
        {filteredCryptocurrencies.map((crypto) => (
          <Grid item xs={12} sm={6} md={4} key={crypto.id}>
            <Card
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  transform: 'scale(1.02)',
                  transition: 'transform 0.2s ease-in-out',
                },
              }}
              onClick={() => navigate(`/cryptocurrency/${crypto.id}`)}
            >
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <img
                    src={crypto.image}
                    alt={crypto.name}
                    style={{ width: 32, height: 32, marginRight: 8 }}
                  />
                  <Typography variant="h6" component="div">
                    {crypto.name}
                  </Typography>
                </Box>
                <Typography color="text.secondary" gutterBottom>
                  ${crypto.current_price.toLocaleString()}
                </Typography>
                <Typography
                  color={crypto.price_change_percentage_24h >= 0 ? 'success.main' : 'error.main'}
                >
                  {crypto.price_change_percentage_24h.toFixed(2)}%
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default Dashboard; 