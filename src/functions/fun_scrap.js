const mongoose = require('mongoose');
const axios = require('axios');

const getCollection = () => {
  return mongoose.connection.collection('market_data');
};

// Service class for market data operations
class MarketDataService {
  constructor() {
    this.collection = getCollection();
  }

   // Insert market data with duplicate handling for time series
   async insertMarketData(data) {
    const transformedData = this.transformMarketData(data);
    try {
      // Group data by symbol for efficient processing
      const dataBySymbol = transformedData.reduce((acc, item) => {
        if (!acc[item.metadata.symbol]) {
          acc[item.metadata.symbol] = [];
        }
        acc[item.metadata.symbol].push(item);
        return acc;
      }, {});

      const results = [];
      
      // Process each symbol's data
      for (const [symbol, symbolData] of Object.entries(dataBySymbol)) {
        // Get the time range for this symbol's data
        const minTime = new Date(Math.min(...symbolData.map(d => d.timestamp.getTime())));
        const maxTime = new Date(Math.max(...symbolData.map(d => d.timestamp.getTime())));

        // Delete existing data in this time range
        await this.collection.deleteMany({
          "metadata.symbol": symbol,
          "timestamp": {
            $gte: minTime,
            $lte: maxTime
          }
        });

        // Insert new data
        const insertResult = await this.collection.insertMany(symbolData);
        results.push(insertResult);
      }

      return results;
    } catch (error) {
      console.error('Error processing time series data:', error);
      throw error;
    }
  }

  // Transform your raw data to proper format
  transformMarketData(rawData) {
    const transformedData = [];
    
    for (const [symbol, data] of Object.entries(rawData)) {
      const { meta, values } = data;
      
      values.forEach(value => {
        transformedData.push({
          metadata: {
            symbol: meta.symbol,
            exchange: meta.exchange,
            type: meta.type,
            currency_base: meta.currency_base,
            currency_quote: meta.currency_quote,
            type: meta.type,
            mic_code: meta.mic_code,
            exchange_timezone: meta.exchange_timezone
          },
          timestamp: new Date(value.datetime),
          open: mongoose.Types.Decimal128.fromString(value.open),
          high: mongoose.Types.Decimal128.fromString(value.high),
          low: mongoose.Types.Decimal128.fromString(value.low),
          close: mongoose.Types.Decimal128.fromString(value.close),
          volume: value.volume ? 
            mongoose.Types.Decimal128.fromString(value.volume) : null
        });
      });
    }
    
    return transformedData;
  }

  // Get latest prices for symbols
  async getLatestPrices(symbols) {
    try {
      return await this.collection.aggregate([
        {
          $match: {
            "metadata.symbol": { $in: symbols }
          }
        },
        {
          $sort: { timestamp: -1 }
        },
        {
          $group: {
            _id: "$metadata.symbol",
            latestPrice: { $first: "$close" },
            timestamp: { $first: "$timestamp" },
            metadata: { $first: "$metadata"}
          }
        }
      ]).toArray();
    } catch (error) {
      console.error('Error getting latest prices:', error);
      throw error;
    }
  }

  // Get price history with interval
  async getPriceHistory(symbol, startDate, endDate) {
    try {
      return await this.collection.find({
        "metadata.symbol": symbol,
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      })
      .sort({ timestamp: 1 })
      .toArray();
    } catch (error) {
      console.error('Error getting price history:', error);
      throw error;
    }
  }

  // Calculate moving average
  async getMovingAverage(symbol, period = 20) {
    try {
      return await this.collection.aggregate([
        {
          $match: {
            "metadata.symbol": symbol
          }
        },
        {
          $sort: { timestamp: 1 }
        },
        {
          $setWindowFields: {
            partitionBy: "$metadata.symbol",
            sortBy: { timestamp: 1 },
            output: {
              movingAverage: {
                $avg: "$close",
                window: {
                  documents: [-period + 1, 0]
                }
              }
            }
          }
        }
      ]).toArray();
    } catch (error) {
      console.error('Error calculating moving average:', error);
      throw error;
    }
  }

  // Get price alerts (values crossing thresholds)
  async checkPriceAlerts(alerts) {
    try {
      const latestPrices = await this.getLatestPrices(
        alerts.map(alert => alert.symbol)
      );
      
      return latestPrices.map(price => {
        const alert = alerts.find(a => a._id === price._id);
        if (!alert) return null;
        
        return {
          symbol: price._id,
          triggered: alert.threshold > price.latestPrice,
          currentPrice: price.latestPrice,
          threshold: alert.threshold
        };
      }).filter(Boolean);
    } catch (error) {
      console.error('Error checking price alerts:', error);
      throw error;
    }
  }
}

module.exports = MarketDataService;

//   try {
//     const { symbol } = req.params;
//     const { start, end } = req.query;
    
//     const prices = await marketDataService.getPriceHistory(
//       symbol,
//       new Date(start),
//       new Date(end)
//     );
    
//     res.json(prices);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });