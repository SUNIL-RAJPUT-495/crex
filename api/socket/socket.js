import mongoose from 'mongoose';
import { scrapeAllMatches, scrapeMatchDetails } from '../scraper/crex.js';
import Match from '../models/Match.js';
import cache from '../services/cache.js';

let ioInstance = null;
let updateInterval = null;
let isScrapingInProgress = false;

// Helper to check if MongoDB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

export function initSocket(io) {
    ioInstance = io;

    io.on('connection', (socket) => {
        console.log(`Socket client connected: ${socket.id}`);

        socket.on('join-match', (slug) => {
            socket.join(slug);
            console.log(`Socket ${socket.id} joined room: ${slug}`);
        });

        socket.on('leave-match', (slug) => {
            socket.leave(slug);
            console.log(`Socket ${socket.id} left room: ${slug}`);
        });

        socket.on('disconnect', () => {
            console.log(`Socket client disconnected: ${socket.id}`);
        });
    });

    startLiveUpdatesLoop();
}

function startLiveUpdatesLoop() {
    if (updateInterval) return;

    // Run every 15 seconds to fetch fresh live match data
    updateInterval = setInterval(async () => {
        if (isScrapingInProgress) {
            console.log("Previous live scraping loop still running, skipping this iteration.");
            return;
        }

        isScrapingInProgress = true;
        console.log("Background loop: Checking for live matches to update via Socket.io...");

        try {
            const allMatchesGroups = await scrapeAllMatches();
            const liveMatches = [];

            for (const group of allMatchesGroups) {
                for (const match of group.matches) {
                    if (match.status === 'LIVE') {
                        liveMatches.push(match);
                    }
                }
            }

            if (ioInstance) {
                ioInstance.emit('live-matches-update', liveMatches);
            }

            if (liveMatches.length > 0) {
                console.log(`Found ${liveMatches.length} live matches. Scraping detailed stats...`);
                
                // Scrape details for each live match concurrently
                const detailScrapePromises = liveMatches.map(async (liveMatch) => {
                    try {
                        const details = await scrapeMatchDetails(liveMatch.slug);

                        // Save details to database if connected
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
                                        timeline: details.timeline,
                                        recentOvers: details.recentOvers,
                                        lastUpdated: new Date()
                                    }
                                },
                                { upsert: true, new: true }
                            );
                        } else {
                            console.log(`Database offline. Skipping saving match details for ${details.slug} to MongoDB.`);
                        }

                        // Cache in Redis/memory cache
                        await cache.set(`match:${details.slug}`, details, 10);

                        // Broadcast to the joined room
                        if (ioInstance) {
                            ioInstance.to(details.slug).emit('match-details-update', details);
                            console.log(`Broadcasted live update room details for slug: ${details.slug}`);
                        }
                    } catch (err) {
                        console.error(`Error updating detailed live match stats for ${liveMatch.slug}:`, err.message);
                    }
                });

                await Promise.all(detailScrapePromises);
            } else {
                console.log("No live matches currently playing.");
            }
        } catch (error) {
            console.error("Error in background Socket.io live updates scraper:", error.message);
        } finally {
            isScrapingInProgress = false;
        }
    }, 4000);
}
