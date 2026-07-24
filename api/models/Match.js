import mongoose from 'mongoose';

const PlayerScoreSchema = new mongoose.Schema({
    shortName: String,
    fullName: String,
    logo: String,
    runs: String,
    balls: String,
    fours: String,
    sixes: String,
    strikeRate: String,
    onStrike: Boolean
});

const BowlerScoreSchema = new mongoose.Schema({
    shortName: String,
    fullName: String,
    logo: String,
    wickets: String,
    runs: String,
    overs: String,
    economy: String
});

const TeamInfoSchema = new mongoose.Schema({
    name: String,
    score: String,
    overs: String,
    logo: String
});

const MatchSchema = new mongoose.Schema({
    matchId: { type: String, required: true, unique: true },
    slug: { type: String, required: true },
    team1: TeamInfoSchema,
    team2: TeamInfoSchema,
    status: { type: String, enum: ['LIVE', 'FINISHED', 'UPCOMING'], default: 'UPCOMING' },
    startTime: String,
    result: String,
    reason: String,
    crr: String,
    rrr: String,
    targetInfo: String,
    batsmen: [PlayerScoreSchema],
    bowlers: [BowlerScoreSchema],
    partnership: String,
    lastWicket: String,
    timeline: [mongoose.Schema.Types.Mixed],
    lastUpdated: { type: Date, default: Date.now }
});

const Match = mongoose.model('Match', MatchSchema);
export default Match;
