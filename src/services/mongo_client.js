const mongoose = require('mongoose');

const initializeDatabase = async () => {
    try {

        mongoose.connection.on("connected", () => {
            console.log("Connected to MongoDB...");
        });

        mongoose.connection.on("disconnected", () => {
            console.log("Disconnected from MongoDB");
        });

        mongoose.connection.on("error", (error) => {
            console.error("Error connecting to MongoDB:", error);
        });

        await mongoose.connect(process.env.MONGO_URL);

        // Create time series collection if it doesn't exist
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        if (!collections.some(c => c.name === 'market_data')) {
            await db.createCollection('market_data', {
                timeseries: {
                    timeField: "timestamp",
                    metaField: "metadata",
                    granularity: "minutes"
                }
            });

            // Create indexes
            const collection = db.collection('market_data');
            await collection.createIndex(
                { "metadata.symbol": 1, timestamp: 1 },
            );
        }

    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
};


module.exports = initializeDatabase;