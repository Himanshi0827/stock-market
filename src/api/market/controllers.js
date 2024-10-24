const MarketDataService = require("../../functions/fun_scrap");
const moment = require('moment-timezone');
const marketDataService = new MarketDataService();
const { fetchMarketData } = require("../../functions/auto_scrap");
const mongoose = require('mongoose');


// Store intervals in memory
const activeIntervals = new Map();

const getCollection = () => {
  return mongoose.connection.collection('auto_scrap_settings');
};

module.exports.getLatestPrice = async (req, res, next) => {
  try {
    const { symbol } = req.query;
    const symbol_list = symbol.split(',');
    const data = await marketDataService.getLatestPrices(symbol_list);

    // Process each price data with its specific timezone
    const processedData = data.map(d => {
      // Convert Decimal128 to float for price
      const processedPrice = parseFloat(d.latestPrice);

      // Convert UTC timestamp to exchange timezone
      const exchangeTimezone = d.metadata?.exchange_timezone || 'UTC';
      const localTimestamp = moment.utc(d.timestamp)
        .tz(exchangeTimezone);

      return {
        symbol: d._id,
        price: processedPrice,
        // Format timestamp in exchange timezone
        timestamp: {
          iso: localTimestamp.toISOString(),
          formatted: localTimestamp.format('YYYY-MM-DD HH:mm:ss'),
          timezone: exchangeTimezone,
          // Include timezone offset for reference
          utc_offset: localTimestamp.format('Z'),
          hours: localTimestamp.hours(),
            minutes: localTimestamp.minutes(),
            seconds: localTimestamp.seconds(),
            day: localTimestamp.date(),
            month: localTimestamp.month(),
            year: localTimestamp.year()
            
        },
        metadata: d.metadata
      };
    });

    return res.json({
      success: true,
      data: processedData
    });

  } catch (error) {
    console.error('Error getting latest price:', error);
    next(error)
  }
};


module.exports.automateScrap = async (req, res, next) => {
  try {
    const { interval } = req.query;
    const { ops } = req.params;
    const collection = getCollection();

    if (ops === 'start') {
      // Clear existing interval if any
      const existingSettings = await collection.findOne({
        key: 'scrap_settings'
      });

      if (existingSettings) {
        const existingIntervalId = activeIntervals.get('scraper');
        if (existingIntervalId) {
          clearInterval(existingIntervalId);
          activeIntervals.delete('scraper');
        }
        await collection.deleteOne({ key: 'scrap_settings' });
      }

      // Start new interval
      const intervalId = setInterval(fetchMarketData, parseInt(interval));
      activeIntervals.set('scraper', intervalId);

      // Store only the configuration, not the interval ID
      await collection.insertOne({
        key: 'scrap_settings',
        interval: parseInt(interval),
        startedAt: new Date(),
        status: 'running'
      });

      return res.json({
        success: true,
        message: `Automated scrap started at ${interval}ms interval`,
        settings: {
          interval: parseInt(interval),
          startedAt: new Date(),
          status: 'running'
        }
      });
    }
    else if (ops === 'stop') {
      const existingIntervalId = activeIntervals.get('scraper');
      if (existingIntervalId) {
        clearInterval(existingIntervalId);
        activeIntervals.delete('scraper');
        
        await collection.updateOne(
          { key: 'scrap_settings' },
          { 
            $set: { 
              status: 'stopped',
              stoppedAt: new Date()
            }
          }
        );

        return res.json({
          success: true,
          message: 'Automated scrap stopped'
        });
      }

      return res.json({
        success: true,
        message: 'Automated scrap is not running'
      });
    }
    else if (ops === 'status') {
      const settings = await collection.findOne({ key: 'scrap_settings' });
      const isRunning = activeIntervals.has('scraper');

      return res.json({
        success: true,
        status: isRunning ? 'running' : 'stopped',
        settings: settings || null
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid operation'
    });

  } catch (error) {
    console.error('Error automating scrap:', error);
    next(error);
  }
};

// Optional: Handle cleanup on application shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

async function cleanup() {
  const collection = getCollection();
  
  // Clear all intervals
  for (const [key, intervalId] of activeIntervals.entries()) {
    clearInterval(intervalId);
    activeIntervals.delete(key);
  }

  // Update database status
  await collection.updateMany(
    { key: 'scrap_settings', status: 'running' },
    { 
      $set: { 
        status: 'stopped',
        stoppedAt: new Date()
      }
    }
  );
}