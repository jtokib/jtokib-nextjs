import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const SurfAISummary = ({ buoyData, windData, tideData, loading }) => {
    const [predictionScore, setPredictionScore] = useState(null);
    const [predictionLoading, setPredictionLoading] = useState(false);
    const [validatedSummary, setValidatedSummary] = useState(null);
    const [summaryValidating, setSummaryValidating] = useState(false);

    // Validate and potentially improve summary with AI
    const validateSummary = async (summary, surfData) => {
        try {
            const response = await fetch('/api/validate-summary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    summary,
                    surfData
                }),
            });

            if (!response.ok) {
                // Fallback to original summary
                return { validatedSummary: summary, wasValidated: false };
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.warn('Summary validation failed:', error);
            // Always fallback to original summary on error
            return { validatedSummary: summary, wasValidated: false };
        }
    };

    // Get BQML prediction
    const getPrediction = async (surfConditions) => {
        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(surfConditions),
            });

            if (!response.ok) {
                console.error('Prediction API error:', response.status);
                return null;
            }

            const data = await response.json();
            return data.predicted_score;
        } catch (error) {
            console.error('Error getting prediction:', error);
            return null;
        }
    };

    // Fetch prediction when surf data changes
    useEffect(() => {
        if (buoyData && windData && tideData && !loading) {
            setPredictionLoading(true);
            
            // Parse data for prediction API
            const waveHeight = parseFloat(buoyData.Hs) || 0;
            const windDirection = windData.direction || 0;
            
            // Determine tide phase
            let tidePhase = 'UNKNOWN';
            if (tideData?.predictions) {
                const tideAnalysis = analyzeTide(tideData);
                tidePhase = tideAnalysis.isDropping ? 'FALLING' : 
                          tideAnalysis.direction === 'rising' ? 'RISING' : 'UNKNOWN';
            }
            
            // Map wind direction to simple direction
            const windDir = getSimpleWindDirection(windDirection);
            
            // Prepare surf conditions for prediction
            const surfConditions = {
                tide: tidePhase,
                wind: windDir,
                pt_reyes: waveHeight.toFixed(1), // Using SF Bar data as proxy for now
                sf_bar: waveHeight.toFixed(1)
            };

            getPrediction(surfConditions)
                .then(score => {
                    setPredictionScore(score);
                    setPredictionLoading(false);
                })
                .catch(() => {
                    setPredictionLoading(false);
                });
        }
    }, [buoyData, windData, tideData, loading]);

    const surfAnalysis = useMemo(() => {
        if (loading || !buoyData || !windData) {
            return {
                summary: "🤖 Analyzing current surf conditions...",
                quality: "unknown",
                emoji: "🔄",
                confidence: 0
            };
        }

        // Parse data
        const waveHeight = parseFloat(buoyData.Hs) || 0;
        const wavePeriod = parseFloat(buoyData.Tp) || 0;
        const waveDirection = parseInt(buoyData.Dp) || 0;
        const windSpeed = parseFloat(windData.speed) || 0;
        const windDirection = windData.direction || 0;

        // Wind analysis
        const windAnalysis = analyzeWind(windDirection, windSpeed);
        
        // Swell analysis
        const swellAnalysis = analyzeSwell(waveHeight, wavePeriod);
        
        // Tide analysis
        const tideAnalysis = analyzeTide(tideData);
        
        // Combined surf quality assessment with tide weighting
        const overallQuality = calculateOverallQuality(windAnalysis, swellAnalysis, tideAnalysis, predictionScore);
        
        // Generate AI summary with tide considerations and ML prediction
        const summary = generateSummary(windAnalysis, swellAnalysis, tideAnalysis, overallQuality, {
            waveHeight,
            wavePeriod,
            windSpeed,
            windDirection,
            predictionScore,
            predictionLoading
        });

        return {
            summary,
            quality: overallQuality.quality,
            emoji: overallQuality.emoji,
            confidence: overallQuality.confidence,
            predictionScore,
            details: {
                wind: windAnalysis,
                swell: swellAnalysis,
                tide: tideAnalysis,
                mlPrediction: predictionScore
            }
        };
    }, [buoyData, windData, tideData, loading, predictionScore, predictionLoading]);

    // Validate summary with AI when it changes
    useEffect(() => {
        if (surfAnalysis.summary && !loading && !summaryValidating) {
            setSummaryValidating(true);
            
            const surfData = {
                waveHeight: parseFloat(buoyData?.Hs) || 0,
                wavePeriod: parseFloat(buoyData?.Tp) || 0,
                windSpeed: parseFloat(windData?.speed) || 0,
                windDirection: windData?.direction || 0
            };

            validateSummary(surfAnalysis.summary, surfData)
                .then(result => {
                    setValidatedSummary(result.validatedSummary);
                    setSummaryValidating(false);
                })
                .catch(() => {
                    setValidatedSummary(surfAnalysis.summary); // Fallback
                    setSummaryValidating(false);
                });
        }
    }, [surfAnalysis.summary]);

    // Use validated summary if available, otherwise use original
    const displaySummary = validatedSummary || surfAnalysis.summary;

    return (
        <motion.div 
            className="surf-ai-summary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
        >
            <motion.div 
                className={`ai-summary-content ${surfAnalysis.quality}`}
                whileHover={{ scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
                <div className="ai-header">
                    <span className="ai-emoji">{surfAnalysis.emoji}</span>
                    <span className="ai-label">🤖 SURF AI</span>
                    <span className="confidence-indicator">
                        {Array.from({ length: 5 }, (_, i) => (
                            <span 
                                key={i} 
                                className={`confidence-dot ${i < surfAnalysis.confidence ? 'active' : ''}`}
                            >
                                •
                            </span>
                        ))}
                    </span>
                </div>
                <div className="ai-summary-text">
                    {summaryValidating ? `${displaySummary} ✨` : displaySummary}
                </div>
            </motion.div>
        </motion.div>
    );
};

// Wind analysis function
function analyzeWind(direction, speed) {
    const directionText = getWindDirectionText(direction);
    
    // East wind is offshore (good for Ocean Beach)
    if (direction >= 45 && direction <= 135) {
        return {
            quality: 'excellent',
            description: 'offshore',
            text: `${speed}kts ${directionText} (offshore)`,
            score: speed < 25 ? 5 : 3, // Even strong offshore is better than onshore
            isOffshore: true
        };
    }
    
    // Onshore winds (N, NW, W, SW, S)
    if (speed <= 3) {
        return {
            quality: 'excellent',
            description: 'glassy',
            text: `${speed}kts ${directionText} (glassy)`,
            score: 5,
            isOffshore: false
        };
    } else if (speed <= 5) {
        return {
            quality: 'good',
            description: 'light wind',
            text: `${speed}kts ${directionText} (light wind)`,
            score: 4,
            isOffshore: false
        };
    } else if (speed <= 8) {
        return {
            quality: 'fair',
            description: 'windy',
            text: `${speed}kts ${directionText} (windy)`,
            score: 2.5,
            isOffshore: false
        };
    } else if (speed <= 12) {
        return {
            quality: 'poor',
            description: 'very windy',
            text: `${speed}kts ${directionText} (very windy)`,
            score: 2,
            isOffshore: false
        };
    } else if (speed <= 18) {
        return {
            quality: 'poor',
            description: 'not surfable',
            text: `${speed}kts ${directionText} (too windy)`,
            score: 1,
            isOffshore: false
        };
    } else {
        return {
            quality: 'dangerous',
            description: 'victory at sea',
            text: `${speed}kts ${directionText} (victory at sea!)`,
            score: 0,
            isOffshore: false
        };
    }
}

// Tide analysis function
function analyzeTide(tideData) {
    if (!tideData?.predictions || tideData.predictions.length < 2) {
        return {
            quality: 'unknown',
            direction: 'unknown',
            text: 'tide data unavailable',
            score: 2.5, // neutral score when tide data unavailable
            nextHighTide: null,
            isDropping: false,
            timeToNextHigh: null
        };
    }

    const now = new Date();
    const predictions = tideData.predictions;
    
    // Find the current tide trend by looking at recent predictions
    let currentTideDirection = 'unknown';
    let nextHighTide = null;
    let isDropping = false;
    
    // Sort predictions by time to find what's happening now
    const sortedPredictions = predictions
        .map(p => ({
            ...p,
            datetime: new Date(p.t.replace(' ', 'T'))
        }))
        .sort((a, b) => a.datetime - b.datetime);
    
    // Find the most recent prediction and the next one
    const currentIndex = sortedPredictions.findIndex(p => p.datetime > now);
    
    if (currentIndex > 0) {
        const lastTide = sortedPredictions[currentIndex - 1];
        const nextTide = sortedPredictions[currentIndex];
        
        // Determine if tide is dropping (from high to low) or rising (from low to high)
        if (lastTide.type === 'H' && nextTide.type === 'L') {
            currentTideDirection = 'dropping';
            isDropping = true;
        } else if (lastTide.type === 'L' && nextTide.type === 'H') {
            currentTideDirection = 'rising';
            nextHighTide = nextTide;
        }
    }
    
    // Find next high tide if we don't have it
    if (!nextHighTide && currentIndex >= 0) {
        for (let i = currentIndex; i < sortedPredictions.length; i++) {
            if (sortedPredictions[i].type === 'H') {
                nextHighTide = sortedPredictions[i];
                break;
            }
        }
    }
    
    // Calculate time to next high tide
    let timeToNextHigh = null;
    if (nextHighTide) {
        const timeDiff = nextHighTide.datetime - now;
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        timeToNextHigh = `${hours}h ${minutes}m`;
    }
    
    // Scoring: Ocean Beach is better on dropping tides
    let score, quality, description;
    if (isDropping) {
        score = 4.5;
        quality = 'excellent';
        const dropPhrases = ['dropping (dialed!)', 'dropping (money time!)', 'dropping (green light!)', 'dropping (go time!)', 'dropping (optimal!)'];
        description = dropPhrases[Math.floor(Math.random() * dropPhrases.length)];
    } else if (currentTideDirection === 'rising') {
        score = 2;
        quality = 'fair';
        const risingPhrases = ['rising (patience pays)', 'rising (almost there)', 'rising (hold tight)', 'rising (wait for it)', 'rising (building up)'];
        description = risingPhrases[Math.floor(Math.random() * risingPhrases.length)];
    } else {
        score = 2.5;
        quality = 'unknown';
        description = 'direction unclear';
    }
    
    return {
        quality,
        direction: currentTideDirection,
        text: `tide ${description}`,
        score,
        nextHighTide,
        isDropping,
        timeToNextHigh
    };
}

// Swell analysis function
function analyzeSwell(height, period) {
    if (height >= 5 && period >= 15) {
        return {
            quality: 'excellent',
            description: 'long period swell',
            text: `${height}ft @ ${period}s (long period swell)`,
            score: 5,
            type: 'long-period'
        };
    } else if (height < 5 && period >= 15) {
        return {
            quality: 'good',
            description: 'small but good',
            text: `${height}ft @ ${period}s (small but good quality)`,
            score: 4,
            type: 'small-good'
        };
    } else if (height >= 5 && period < 12) {
        return {
            quality: 'fair',
            description: 'windswell',
            text: `${height}ft @ ${period}s (windswell)`,
            score: 2,
            type: 'windswell'
        };
    } else if (period >= 12 && period < 15) {
        return {
            quality: 'fair',
            description: 'mid-period swell',
            text: `${height}ft @ ${period}s (mid-period)`,
            score: 3,
            type: 'mid-period'
        };
    } else {
        return {
            quality: 'poor',
            description: 'small and short period',
            text: `${height}ft @ ${period}s (small & choppy)`,
            score: 1,
            type: 'poor'
        };
    }
}

// Calculate overall surf quality with tide weighting and ML prediction
function calculateOverallQuality(windAnalysis, swellAnalysis, tideAnalysis, predictionScore = null) {
    // CRITICAL: If wind is too strong (>15kts onshore), conditions are not surfable
    // regardless of how good swell or tide might be
    if (windAnalysis.score <= 1 && !windAnalysis.isOffshore) {
        return {
            quality: 'terrible',
            emoji: '💨',
            confidence: 5, // High confidence that strong onshore wind = not surfable
            score: 0.5,
            isFiring: false,
            hasMLPrediction: predictionScore !== null && predictionScore !== undefined,
            windOverride: true
        };
    }
    
    // WIND OVERRIDE: If wind is poor (>10kts onshore), heavily penalize
    if (windAnalysis.score <= 2 && !windAnalysis.isOffshore) {
        // Cap the overall score at 2.5 max when wind is poor
        let combinedScore = Math.min(2.5, (windAnalysis.score * 0.6 + swellAnalysis.score * 0.3 + tideAnalysis.score * 0.1));
        
        if (predictionScore !== null && predictionScore !== undefined) {
            const normalizedPrediction = Math.max(0, Math.min(2.5, predictionScore / 4)); // Cap ML at 2.5 too
            combinedScore = Math.min(2.5, combinedScore * 0.8 + normalizedPrediction * 0.2);
        }
        
        let quality, emoji;
        if (combinedScore >= 2.0) {
            quality = 'poor';
            emoji = '💨';
        } else {
            quality = 'terrible';
            emoji = '🌪️';
        }
        
        return {
            quality,
            emoji,
            confidence: 4,
            score: combinedScore,
            isFiring: false,
            hasMLPrediction: predictionScore !== null && predictionScore !== undefined,
            windOverride: true
        };
    }
    
    // Normal calculation when wind is manageable
    let combinedScore = (windAnalysis.score * 0.4 + swellAnalysis.score * 0.4 + tideAnalysis.score * 0.2);
    
    // If we have ML prediction, blend it in (prediction score is typically 0-10)
    if (predictionScore !== null && predictionScore !== undefined) {
        // Normalize prediction score to 0-5 scale to match other scores
        const normalizedPrediction = Math.max(0, Math.min(5, predictionScore / 2));
        // Blend prediction with combined score (30% prediction, 70% traditional analysis)
        combinedScore = combinedScore * 0.7 + normalizedPrediction * 0.3;
    }
    
    let quality, emoji, confidence;
    
    // Check for FIRING conditions: 10ft+ swell, 18s+ period, dropping tide
    const waveHeight = parseFloat(swellAnalysis.text.match(/[\d.]+/)?.[0]) || 0;
    const wavePeriod = parseFloat(swellAnalysis.text.match(/@ ([\d.]+)s/)?.[1]) || 0;
    const isFiring = waveHeight >= 10 && wavePeriod >= 18 && tideAnalysis.isDropping;
    
    // Enhanced confidence when ML prediction is available
    const hasMLPrediction = predictionScore !== null && predictionScore !== undefined;
    
    if (isFiring) {
        quality = 'firing';
        emoji = '🔥';
        confidence = hasMLPrediction ? 5 : 5;
    } else if (combinedScore >= 4.2) {
        quality = 'epic';
        emoji = '⚡';
        confidence = hasMLPrediction ? 5 : 5;
    } else if (combinedScore >= 3.5) {
        quality = 'good';
        emoji = '👌';
        confidence = hasMLPrediction ? 5 : 4;
    } else if (combinedScore >= 2.5) {
        quality = 'fair';
        emoji = '🤷‍♂️';
        confidence = hasMLPrediction ? 4 : 3;
    } else if (combinedScore >= 1.5) {
        quality = 'poor';
        emoji = '😬';
        confidence = hasMLPrediction ? 3 : 2;
    } else {
        quality = 'terrible';
        emoji = '💀';
        confidence = hasMLPrediction ? 2 : 1;
    }
    
    return { quality, emoji, confidence, score: combinedScore, isFiring, hasMLPrediction };
}

// Generate AI summary text
function generateSummary(windAnalysis, swellAnalysis, tideAnalysis, overallQuality, data) {
    const { waveHeight, wavePeriod, windSpeed, windDirection, predictionScore, predictionLoading } = data;
    
    // WIND OVERRIDE: Special messages when wind ruins otherwise good conditions
    if (overallQuality.windOverride) {
        const windOverrideMessages = {
            terrible: [
                `💨 TOO WINDY! ${windAnalysis.text} is making it unsurfable despite ${swellAnalysis.description}. Wind ruins everything - stay home!`,
                `🌪️ BLOWN OUT! ${windAnalysis.text} has destroyed the surf. Even with ${swellAnalysis.description}, it's chaos out there!`,
                `💀 VICTORY AT SEA! ${windAnalysis.text} - doesn't matter if the swell is ${swellAnalysis.description}, it's unrideable!`,
                `🚫 WIND ADVISORY! ${windAnalysis.text} makes surfing impossible. ${swellAnalysis.text} but too windy to matter!`
            ],
            poor: [
                `💨 WINDY & BUMPY! ${windAnalysis.text} is chopping up the surf. ${swellAnalysis.description} but very challenging conditions.`,
                `🌊💨 WIND AFFECTED! ${windAnalysis.text} creating tough conditions despite ${swellAnalysis.description}. For experts only!`,
                `⚠️ MANAGEABLE BUT MESSY! ${windAnalysis.text} making it bumpy. ${swellAnalysis.text} but wind is the limiting factor.`,
                `🤙 HARDCORE SESSION! ${windAnalysis.text} - doable but gnarly. ${swellAnalysis.description} underneath the chop.`
            ]
        };
        
        const messages = windOverrideMessages[overallQuality.quality] || windOverrideMessages.terrible;
        let baseMessage = messages[Math.floor(Math.random() * messages.length)];
        
        // Add ML context if available
        if (predictionLoading) {
            baseMessage += ' 🧠 ML confirms: wind matters most...';
        } else if (predictionScore !== null && predictionScore !== undefined) {
            const mlScore = Math.round(predictionScore * 10) / 10;
            baseMessage += ` 🧠 ML agrees: wind-limited (${mlScore}/10)`;
        }
        
        return baseMessage;
    }
    
    // Special handling for tide-dependent recommendations
    const tideRecommendation = getTideRecommendation(tideAnalysis, windAnalysis, swellAnalysis);
    
    // Add ML prediction context if available
    let mlContext = '';
    if (predictionLoading) {
        mlContext = ' 🧠 Crunching ML data...';
    } else if (predictionScore !== null && predictionScore !== undefined) {
        const mlScore = Math.round(predictionScore * 10) / 10;
        if (mlScore >= 7) {
            mlContext = ` 🧠 ML confidence: HIGH (${mlScore}/10)`;
        } else if (mlScore >= 4) {
            mlContext = ` 🧠 ML says: moderate (${mlScore}/10)`;
        } else {
            mlContext = ` 🧠 ML caution: ${mlScore}/10`;
        }
    }
    
    const summaries = {
        firing: [
            `🔥 FIRING! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. This is IT - drop everything and surf NOW!${mlContext}`,
            `🚨 BREAKING: Epic conditions! ${swellAnalysis.text} with ${windAnalysis.text} and ${tideAnalysis.text}. All systems GO!${mlContext}`,
            `⚡ NUCLEAR! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. The stars have aligned - GO SURF!${mlContext}`
        ],
        epic: [
            `⚡ Epic session brewing! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`,
            `🏄‍♂️ Premium conditions! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`,
            `🔥 Solid surf alert! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`
        ],
        good: [
            `👌 Quality waves ahead! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`,
            `🌊 Nice conditions brewing! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`,
            `🤙 Solid session potential! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`
        ],
        fair: [
            `🤷‍♂️ Mixed bag today. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`,
            `⚖️ So-so conditions. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`,
            `🌪️ Challenging surf. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}${mlContext}`
        ],
        poor: [
            `😬 Rough conditions. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation || 'Maybe check the cam first?'}${mlContext}`,
            `🌊💨 Messy surf today. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Better days ahead!${mlContext}`,
            `📚 Study session weather. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Time to wax your board!${mlContext}`
        ],
        terrible: [
            `💀 Gnarly out there! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Stay on the beach!${mlContext}`,
            `⚠️ Danger zone! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Not surfable!${mlContext}`,
            `🏠 Indoor day! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Surf movies and planning time!${mlContext}`
        ]
    };
    
    const options = summaries[overallQuality.quality] || summaries.fair;
    return options[Math.floor(Math.random() * options.length)];
}

// Generate tide-specific recommendations
function getTideRecommendation(tideAnalysis, windAnalysis, swellAnalysis) {
    if (tideAnalysis.direction === 'unknown') {
        return 'Monitor tide changes for optimal timing.';
    }
    
    if (tideAnalysis.isDropping) {
        const perfectTimingPhrases = [
            'Perfect timing - conditions are dialed!',
            'Stellar timing - everything aligned!',
            'Money timing - window is open!',
            'Prime conditions - go time!',
            'Perfect window - conditions are firing!'
        ];
        return perfectTimingPhrases[Math.floor(Math.random() * perfectTimingPhrases.length)];
    }
    
    if (tideAnalysis.direction === 'rising' && tideAnalysis.nextHighTide && tideAnalysis.timeToNextHigh) {
        const nextHighTime = tideAnalysis.nextHighTide.t.split(' ')[1]; // Extract time
        
        // If conditions are otherwise good, recommend waiting
        if (windAnalysis.score >= 3.5 && swellAnalysis.score >= 3.5) {
            return `Consider waiting - tide turns at ${nextHighTime} (in ${tideAnalysis.timeToNextHigh}).`;
        } else {
            return `Tide rising (turns at ${nextHighTime}) - better surf after the turn.`;
        }
    }
    
    return 'Check tide timing for optimal conditions.';
}

// Helper function to get wind direction text
function getWindDirectionText(degrees) {
    if (degrees >= 337.5 || degrees < 22.5) return 'N';
    if (degrees >= 22.5 && degrees < 67.5) return 'NE';
    if (degrees >= 67.5 && degrees < 112.5) return 'E';
    if (degrees >= 112.5 && degrees < 157.5) return 'SE';
    if (degrees >= 157.5 && degrees < 202.5) return 'S';
    if (degrees >= 202.5 && degrees < 247.5) return 'SW';
    if (degrees >= 247.5 && degrees < 292.5) return 'W';
    if (degrees >= 292.5 && degrees < 337.5) return 'NW';
    return 'N/A';
}

// Helper function to get simple wind direction for ML prediction
function getSimpleWindDirection(degrees) {
    if (degrees >= 315 || degrees < 45) return 'N';
    if (degrees >= 45 && degrees < 135) return 'E';
    if (degrees >= 135 && degrees < 225) return 'S';
    if (degrees >= 225 && degrees < 315) return 'W';
    return 'W'; // Default fallback
}

export default SurfAISummary;