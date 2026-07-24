import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Play, Calendar, CheckCircle2, User, HelpCircle, Activity, Star } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://crex-silk.vercel.app';
const IS_VERCEL_ENV = API_BASE_URL.includes('vercel.app');

function App() {
  const [filter, setFilter] = useState('all'); // 'all' or 'live'
  const [allMatches, setAllMatches] = useState([]); // Array of { date, matches }
  const [liveMatches, setLiveMatches] = useState([]); // Array of match objects
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef(null);
  const previousSlugRef = useRef(null);

  // Initialize Socket.io Connection
  useEffect(() => {
    if (IS_VERCEL_ENV) {
      console.log('Vercel environment detected: Socket.io is disabled (WebSockets not supported). Falling back to HTTP Polling.');
      setIsConnected(true); // Treat polling state as connected/active
      return;
    }

    const socket = io(API_BASE_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Socket.io connected successfully');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket.io disconnected');
    });

    // Real-time live matches list update
    socket.on('live-matches-update', (updatedLiveMatches) => {
      console.log('Received live matches update:', updatedLiveMatches);
      setLiveMatches(updatedLiveMatches);
    });

    // Real-time selected match details update
    socket.on('match-details-update', (updatedDetails) => {
      console.log('Received detailed match update:', updatedDetails.slug);
      setSelectedDetails((curr) => {
        if (curr && curr.slug === updatedDetails.slug) {
          return updatedDetails;
        }
        return curr;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch matches initially on mount
  useEffect(() => {
    fetchMatches();
  }, []);

  // HTTP Polling Fallback (runs only in Vercel environment)
  useEffect(() => {
    if (!IS_VERCEL_ENV) return;

    const interval = setInterval(() => {
      console.log('HTTP polling: fetching live updates...');
      fetchMatches();

      if (selectedSlug) {
        fetchMatchDetailsSilent(selectedSlug);
      }
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [selectedSlug]);

  // Fetch match details in background without showing loader
  const fetchMatchDetailsSilent = async (slug) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/matches/${slug}`);
      const data = await res.json();
      if (data.success) {
        setSelectedDetails(data.data);
      }
    } catch (err) {
      console.error('Error polling match details:', err);
    }
  };

  // Fetch matches from REST API
  const fetchMatches = async () => {
    try {
      // Fetch All Matches
      const resAll = await fetch(`${API_BASE_URL}/api/matches/all`);
      const dataAll = await resAll.json();
      if (dataAll.success) {
        setAllMatches(dataAll.data);
      }

      // Fetch Live Matches
      const resLive = await fetch(`${API_BASE_URL}/api/matches/live`);
      const dataLive = await resLive.json();
      if (dataLive.success) {
        setLiveMatches(dataLive.data);
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
    }
  };

  // Handle Match Click
  const handleSelectMatch = async (slug) => {
    if (selectedSlug === slug) return;

    setDetailsLoading(true);
    setSelectedSlug(slug);
    setSelectedDetails(null);

    // Socket: Join match room and leave previous room
    if (socketRef.current) {
      if (previousSlugRef.current) {
        socketRef.current.emit('leave-match', previousSlugRef.current);
      }
      socketRef.current.emit('join-match', slug);
      previousSlugRef.current = slug;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/matches/${slug}`);
      const data = await res.json();
      if (data.success) {
        setSelectedDetails(data.data);
      }
    } catch (err) {
      console.error('Error fetching match details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Get ball update badge class name
  const getBallBadgeClass = (res) => {
    if (!res) return 'dot';
    const text = res.toUpperCase();
    if (text === '4' || text === '6') return 'boundary';
    if (text === 'W' || text.includes('OUT')) return 'wicket';
    if (text === '0' || text === 'DOT') return 'dot';
    if (text.includes('WD') || text.includes('NB') || text.includes('BYE') || text.includes('LB')) return 'extra';
    return 'single';
  };

  // Render initials if logo is missing or loading fails
  const renderTeamLogo = (logo, name) => {
    if (logo && logo.startsWith('http')) {
      return (
        <img 
          src={logo} 
          alt={name} 
          className="team-logo" 
          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
        />
      );
    }
    const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 3).toUpperCase() : '?';
    return (
      <div className="team-logo" style={{ background: 'linear-gradient(135deg, #1f2937, #374151)' }}>
        {initials}
      </div>
    );
  };

  return (
    <div>
      {/* App Header */}
      <header className="app-header">
        <div className="container header-content">
          <div className="brand">
            <div className="brand-icon">C</div>
            <h1>CREX Live Cricket</h1>
          </div>
          <div className="socket-status">
            <span className={`status-dot ${(IS_VERCEL_ENV || isConnected) ? 'connected' : 'disconnected'}`}></span>
            {IS_VERCEL_ENV ? 'Live Updates Active (Polling)' : isConnected ? 'Real-time Feed Live' : 'Reconnecting...'}
          </div>
        </div>
      </header>

      <div className="container">
        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="tabs">
            <button 
              className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              <Calendar size={15} /> All Matches
            </button>
            <button 
              className={`tab-btn ${filter === 'live' ? 'active' : ''}`}
              onClick={() => setFilter('live')}
            >
              <Play size={15} /> Live Matches
              {liveMatches.length > 0 && <span className="live-blinker"></span>}
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="dashboard-grid">
          
          {/* Sidebar Match list */}
          <div className="sidebar-panel">
            <div className="matches-list">
              
              {filter === 'live' ? (
                liveMatches.length > 0 ? (
                  liveMatches.map((match) => (
                    <div 
                      key={match.matchId}
                      className={`card-base match-card ${selectedSlug === match.slug ? 'selected' : ''}`}
                      onClick={() => handleSelectMatch(match.slug)}
                    >
                      <div className="card-header">
                        <span>{match.reason || 'Cricket Match'}</span>
                      </div>
                      <div className="card-body">
                        <div className="team-row">
                          <div className="team-meta">
                            {renderTeamLogo(match.team1.logo, match.team1.name)}
                            <span className="team-name">{match.team1.name}</span>
                          </div>
                          <div className="score-meta">
                            <span className="score-val">{match.team1.score || 'Yet to bat'}</span>
                            {match.team1.overs && <span className="overs-val">({match.team1.overs})</span>}
                          </div>
                        </div>
                        <div className="team-row">
                          <div className="team-meta">
                            {renderTeamLogo(match.team2.logo, match.team2.name)}
                            <span className="team-name">{match.team2.name}</span>
                          </div>
                          <div className="score-meta">
                            <span className="score-val">{match.team2.score || 'Yet to bat'}</span>
                            {match.team2.overs && <span className="overs-val">({match.team2.overs})</span>}
                          </div>
                        </div>
                      </div>
                      <div className="card-footer">
                        <span className="status-badge live">
                          <span className="live-blinker"></span> LIVE
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>Click for details</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="detail-placeholder">
                    <Activity size={32} className="placeholder-icon" />
                    <p>No matches are currently Live.</p>
                  </div>
                )
              ) : (
                allMatches.map((group) => (
                  <div key={group.date} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', padding: '5px 0', color: 'var(--text-secondary)' }}>
                      {group.date}
                    </div>
                    {group.matches.map((match) => (
                      <div 
                        key={match.matchId}
                        className={`card-base match-card ${selectedSlug === match.slug ? 'selected' : ''}`}
                        onClick={() => handleSelectMatch(match.slug)}
                      >
                        <div className="card-header">
                          <span>{match.reason || 'Cricket Match'}</span>
                        </div>
                        <div className="card-body">
                          <div className="team-row">
                            <div className="team-meta">
                              {renderTeamLogo(match.team1.logo, match.team1.name)}
                              <span className="team-name">{match.team1.name}</span>
                            </div>
                            <div className="score-meta">
                              <span className="score-val">{match.team1.score || (match.status === 'UPCOMING' ? 'Yet to start' : 'Yet to bat')}</span>
                              {match.team1.overs && <span className="overs-val">({match.team1.overs} ov)</span>}
                            </div>
                          </div>
                          <div className="team-row">
                            <div className="team-meta">
                              {renderTeamLogo(match.team2.logo, match.team2.name)}
                              <span className="team-name">{match.team2.name}</span>
                            </div>
                            <div className="score-meta">
                              <span className="score-val">{match.team2.score || (match.status === 'UPCOMING' ? 'Yet to start' : 'Yet to bat')}</span>
                              {match.team2.overs && <span className="overs-val">({match.team2.overs} ov)</span>}
                            </div>
                          </div>
                        </div>
                        <div className="card-footer">
                          <span className={`status-badge ${match.status.toLowerCase()}`}>
                            {match.status === 'LIVE' && <span className="live-blinker"></span>}
                            {match.status === 'FINISHED' && <CheckCircle2 size={13} />}
                            {match.status === 'UPCOMING' && <Calendar size={13} />}
                            {match.status}
                          </span>
                          <span>{match.result || match.startTime || 'Details'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main Detail View */}
          <div className="main-panel">
            
            {detailsLoading ? (
              <div className="detail-placeholder">
                <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' }}></div>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                <p>Scraping match data in real-time...</p>
              </div>
            ) : selectedDetails ? (
              <div className="detail-view">
                <div className="detail-scroll">
                  
                  {/* Match Header Scorecard */}
                  <div className="card-base match-detail-header">
                    <div className="detail-header-top">
                      <span>{selectedDetails.reason || 'Match Details'}</span>
                      <span className={`status-badge ${selectedDetails.status.toLowerCase()}`}>
                        {selectedDetails.status === 'LIVE' ? (
                          <><span className="live-blinker"></span> LIVE</>
                        ) : selectedDetails.status}
                      </span>
                    </div>

                    <div className="detail-teams-row">
                      <div className="detail-team-box">
                        {renderTeamLogo(selectedDetails.team1.logo, selectedDetails.team1.name)}
                        <span className="detail-team-name">{selectedDetails.team1.name}</span>
                        {selectedDetails.team1.score && (
                          <span className="detail-team-score">{selectedDetails.team1.score}</span>
                        )}
                        {selectedDetails.team1.overs && (
                          <span className="overs-val">{selectedDetails.team1.overs} overs</span>
                        )}
                      </div>

                      <div className="detail-vs">VS</div>

                      <div className="detail-team-box">
                        {renderTeamLogo(selectedDetails.team2.logo, selectedDetails.team2.name)}
                        <span className="detail-team-name">{selectedDetails.team2.name}</span>
                        {selectedDetails.team2.score && (
                          <span className="detail-team-score">{selectedDetails.team2.score}</span>
                        )}
                        {selectedDetails.team2.overs && (
                          <span className="overs-val">{selectedDetails.team2.overs} overs</span>
                        )}
                      </div>
                    </div>

                    {(selectedDetails.crr || selectedDetails.rrr) && (
                      <div className="header-bottom-meta">
                        {selectedDetails.crr && (
                          <div>
                            <div className="meta-item-title">Current Run Rate</div>
                            <div className="meta-item-val" style={{ color: 'var(--color-emerald)' }}>{selectedDetails.crr}</div>
                          </div>
                        )}
                        {selectedDetails.rrr && (
                          <div>
                            <div className="meta-item-title">Required Run Rate</div>
                            <div className="meta-item-val" style={{ color: 'var(--color-gold)' }}>{selectedDetails.rrr}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedDetails.targetInfo && (
                      <div className="target-info">
                        {selectedDetails.targetInfo}
                      </div>
                    )}

                    {selectedDetails.result && (
                      <div style={{ textAlign: 'center', fontSize: '15px', fontWeight: '700', color: 'var(--color-emerald)', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', padding: '10px', borderRadius: '6px' }}>
                        {selectedDetails.result}
                      </div>
                    )}
                  </div>

                  {/* Active Batsmen & Bowlers Card */}
                  {selectedDetails.status !== 'UPCOMING' && (
                    <div className="card-base active-players-card">
                      {selectedDetails.batsmen && selectedDetails.batsmen.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                          <h3 className="section-title"><User size={16} /> Active Batsmen</h3>
                          <div className="table-responsive">
                            <table className="table-stats">
                              <thead>
                                <tr>
                                  <th>Batsman</th>
                                  <th style={{ textAlign: 'center' }}>Runs</th>
                                  <th style={{ textAlign: 'center' }}>Balls</th>
                                  <th style={{ textAlign: 'center' }}>4s</th>
                                  <th style={{ textAlign: 'center' }}>6s</th>
                                  <th style={{ textAlign: 'right' }}>SR</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedDetails.batsmen.map((bat, idx) => (
                                  <tr key={idx}>
                                    <td className="player-name-col">
                                      {bat.fullName || bat.shortName}
                                      {bat.onStrike && <Star size={11} className="strike-star" fill="var(--color-gold)" />}
                                    </td>
                                    <td style={{ textAlign: 'center' }} className="run-highlight">{bat.runs}</td>
                                    <td style={{ textAlign: 'center' }} className="table-muted-text">{bat.balls}</td>
                                    <td style={{ textAlign: 'center' }}>{bat.fours}</td>
                                    <td style={{ textAlign: 'center' }}>{bat.sixes}</td>
                                    <td style={{ textAlign: 'right', fontWeight: '500', color: 'var(--color-emerald)' }}>{bat.strikeRate}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {selectedDetails.bowlers && selectedDetails.bowlers.length > 0 && (
                        <div>
                          <h3 className="section-title"><Activity size={16} /> Active Bowlers</h3>
                          <div className="table-responsive">
                            <table className="table-stats">
                              <thead>
                                <tr>
                                  <th>Bowler</th>
                                  <th style={{ textAlign: 'center' }}>Overs</th>
                                  <th style={{ textAlign: 'center' }}>Runs</th>
                                  <th style={{ textAlign: 'center' }}>Wickets</th>
                                  <th style={{ textAlign: 'right' }}>Econ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedDetails.bowlers.map((bowl, idx) => (
                                  <tr key={idx}>
                                    <td className="player-name-col">
                                      {bowl.fullName || bowl.shortName}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{bowl.overs}</td>
                                    <td style={{ textAlign: 'center' }}>{bowl.runs}</td>
                                    <td style={{ textAlign: 'center', color: 'var(--color-live)', fontWeight: '700' }}>{bowl.wickets}</td>
                                    <td style={{ textAlign: 'right', fontWeight: '500', color: 'var(--color-gold)' }}>{bowl.economy}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Commentary Timeline */}
                  {selectedDetails.timeline && selectedDetails.timeline.length > 0 && (
                    <div className="card-base commentary-card">
                      <h3 className="section-title"><Play size={16} /> Runs Per Over & Commentary</h3>
                      <div className="timeline-list">
                        {selectedDetails.timeline.map((item, idx) => {
                          if (item.type === 'OVER_SUMMARY') {
                            return (
                              <div key={idx} className="timeline-item-over">
                                <div className="over-summary-header">
                                  <span>{item.heading}</span>
                                </div>
                                <div className="over-summary-content">
                                  <div className="over-summary-batsmen">
                                    {item.batsmen?.map((bat, bIdx) => (
                                      <span key={bIdx}>{bat.name}: <strong style={{ color: 'var(--text-main)' }}>{bat.score}</strong></span>
                                    ))}
                                  </div>
                                  <div className="over-summary-bowler">
                                    <span>Bowler: {item.bowler?.name} ({item.bowler?.stats})</span>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div key={idx} className="timeline-item-ball">
                                <div className="ball-num">{item.over}</div>
                                <div className={`ball-badge ${getBallBadgeClass(item.result)}`}>
                                  {item.result || '0'}
                                </div>
                                <div className="ball-desc">
                                  <div className="ball-commentary">{item.commentary}</div>
                                  {item.details && <div className="ball-details">{item.details}</div>}
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="detail-placeholder">
                <HelpCircle size={48} className="placeholder-icon" />
                <h2>No Match Selected</h2>
                <p>Click on any match card in the list to view its real-time live details, scorecard, and over summaries.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
