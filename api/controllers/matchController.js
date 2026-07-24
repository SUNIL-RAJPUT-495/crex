import mongoose from 'mongoose';
import { scrapeAllMatches, scrapeMatchDetails } from '../scraper/crex.js';
import Match from '../models/Match.js';
import cache from '../services/cache.js';

// Helper to check if MongoDB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

// Helper to upsert matches into MongoDB
async function saveMatchesToDatabase(matchGroups) {
    if (!isDbConnected()) {
        console.log("Database offline. Skipping saving matches to MongoDB.");
        return;
    }
    
    const upsertPromises = [];
    for (const group of matchGroups) {
        for (const match of group.matches) {
            upsertPromises.push(
                Match.findOneAndUpdate(
                    { matchId: match.matchId },
                    {
                        $set: {
                            slug: match.slug,
                            team1: match.team1,
                            team2: match.team2,
                            status: match.status,
                            startTime: match.startTime,
                            result: match.result,
                            reason: match.reason,
                            lastUpdated: new Date()
                        }
                    },
                    { upsert: true, new: true }
                ).catch(err => console.error(`Error saving match ${match.matchId} to DB:`, err.message))
            );
        }
    }
    await Promise.all(upsertPromises);
}

// 1. Get All Matches
export async function getAllMatches(req, res) {
    try {
        const cacheKey = 'matches:all';
        const cachedData = await cache.get(cacheKey);
        
        if (cachedData) {
            return res.json({ success: true, fromCache: true, data: cachedData });
        }

        console.log("Cache miss: scraping all matches...");
        const matchesData = await scrapeAllMatches();

        // Save to MongoDB in background if database is online
        saveMatchesToDatabase(matchesData).catch(err => console.error("DB Save Error:", err));

        // Cache in Redis for 30 seconds
        await cache.set(cacheKey, matchesData, 30);

        res.json({ success: true, fromCache: false, data: matchesData });
    } catch (error) {
        console.error("Error in getAllMatches controller:", error);
        
        // Graceful fallback to database if online
        if (isDbConnected()) {
            try {
                console.log("Attempting database fallback for all matches...");
                const dbMatches = await Match.find().sort({ lastUpdated: -1 });
                return res.json({
                    success: true,
                    fallback: true,
                    message: "Database fallback due to scraping error",
                    data: [{ date: "Saved Matches", matches: dbMatches }]
                });
            } catch (dbError) {
                res.status(500).json({ success: false, error: dbError.message });
            }
        } else {
            res.status(500).json({ success: false, error: "Scraping failed and database is offline: " + error.message });
        }
    }
}

// 2. Get Live Matches
export async function getLiveMatches(req, res) {
    try {
        const cacheKey = 'matches:live';
        const cachedData = await cache.get(cacheKey);

        if (cachedData) {
            return res.json({ success: true, fromCache: true, data: cachedData });
        }

        console.log("Cache miss: scraping live matches...");
        const allMatchesGroups = await scrapeAllMatches();
        const liveMatches = [];

        for (const group of allMatchesGroups) {
            for (const match of group.matches) {
                if (match.status === 'LIVE') {
                    liveMatches.push(match);
                }
            }
        }

        // Save to DB in background if database is online
        saveMatchesToDatabase(allMatchesGroups).catch(err => console.error("DB Save Error:", err));

        // Cache live matches in Redis for 10 seconds
        await cache.set(cacheKey, liveMatches, 10);

        res.json({ success: true, fromCache: false, data: liveMatches });
    } catch (error) {
        console.error("Error in getLiveMatches controller:", error);

        // Graceful fallback to database if online
        if (isDbConnected()) {
            try {
                console.log("Attempting database fallback for live matches...");
                const dbLiveMatches = await Match.find({ status: 'LIVE' });
                return res.json({
                    success: true,
                    fallback: true,
                    message: "Database fallback due to scraping error",
                    data: dbLiveMatches
                });
            } catch (dbError) {
                res.status(500).json({ success: false, error: dbError.message });
            }
        } else {
            res.status(500).json({ success: false, error: "Scraping failed and database is offline: " + error.message });
        }
    }
}

// 3. Get Match Details
export async function getMatchDetails(req, res) {
    const { slug } = req.params;
    try {
        const cacheKey = `match:${slug}`;
        const cachedDetails = await cache.get(cacheKey);

        if (cachedDetails) {
            return res.json({ success: true, fromCache: true, data: cachedDetails });
        }

        console.log(`Cache miss: scraping match details for ${slug}...`);
        const details = await scrapeMatchDetails(slug);

        // Save/Update in MongoDB if database is online
        if (isDbConnected()) {
            await Match.findOneAndUpdate(
                { matchId: details.matchId },
                {
                    $set: {
                        slug: details.slug,
                        team1: details.team1,
                        team2: details.team2,
                        status: details.status,
                        crr: details.crr,
                        rrr: details.rrr,
                        targetInfo: details.targetInfo,
                        result: details.result,
                        batsmen: details.batsmen,
                        bowlers: details.bowlers,
                        partnership: details.partnership,
                        lastWicket: details.lastWicket,
                        timeline: details.timeline,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true, new: true }
            ).catch(err => console.error("DB Save details Error:", err.message));
        } else {
            console.log("Database offline. Skipping saving match details to MongoDB.");
        }

        // Cache result: if finished, cache for 1 day. If live, cache for 5 seconds. If upcoming, cache for 1 minute.
        let ttl = 5; // default 5s for live
        if (details.status === 'FINISHED') {
            ttl = 86400; // 24 hours
        } else if (details.status === 'UPCOMING') {
            ttl = 60; // 1 minute
        }

        await cache.set(cacheKey, details, ttl);

        res.json({ success: true, fromCache: false, data: details });
    } catch (error) {
        console.error(`Error in getMatchDetails controller for ${slug}:`, error);

        // Fallback to database if online
        if (isDbConnected()) {
            try {
                console.log(`Attempting database fallback for match details of ${slug}...`);
                const dbMatch = await Match.findOne({ slug });
                if (dbMatch) {
                    return res.json({
                        success: true,
                        fallback: true,
                        message: "Database fallback due to scraping error",
                        data: dbMatch
                    });
                }
                res.status(404).json({ success: false, error: "Match details not found in cache, scraper, or database" });
            } catch (dbError) {
                res.status(500).json({ success: false, error: dbError.message });
            }
        } else {
            res.status(500).json({ success: false, error: "Scraping failed and database/cache fallback unavailable: " + error.message });
        }
    }
}
