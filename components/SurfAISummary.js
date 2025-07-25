import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const SurfAISummary = ({ buoyData, windData, tideData, loading }) => {
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
        const overallQuality = calculateOverallQuality(windAnalysis, swellAnalysis, tideAnalysis);
        
        // Generate AI summary with tide considerations
        const summary = generateSummary(windAnalysis, swellAnalysis, tideAnalysis, overallQuality, {
            waveHeight,
            wavePeriod,
            windSpeed,
            windDirection
        });

        return {
            summary,
            quality: overallQuality.quality,
            emoji: overallQuality.emoji,
            confidence: overallQuality.confidence,
            details: {
                wind: windAnalysis,
                swell: swellAnalysis,
                tide: tideAnalysis
            }
        };
    }, [buoyData, windData, tideData, loading]);

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
                    {surfAnalysis.summary}
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
    } else if (speed <= 10) {
        return {
            quality: 'fair',
            description: 'windy',
            text: `${speed}kts ${directionText} (windy)`,
            score: 2,
            isOffshore: false
        };
    } else if (speed <= 20) {
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

// Calculate overall surf quality with tide weighting
function calculateOverallQuality(windAnalysis, swellAnalysis, tideAnalysis) {
    // Weight the scores: swell and wind are primary, tide is secondary but important
    const combinedScore = (windAnalysis.score * 0.4 + swellAnalysis.score * 0.4 + tideAnalysis.score * 0.2);
    
    let quality, emoji, confidence;
    
    // Check for FIRING conditions: 10ft+ swell, 18s+ period, dropping tide
    const waveHeight = parseFloat(swellAnalysis.text.match(/[\d.]+/)?.[0]) || 0;
    const wavePeriod = parseFloat(swellAnalysis.text.match(/@ ([\d.]+)s/)?.[1]) || 0;
    const isFiring = waveHeight >= 10 && wavePeriod >= 18 && tideAnalysis.isDropping;
    
    if (isFiring) {
        quality = 'firing';
        emoji = '🔥';
        confidence = 5;
    } else if (combinedScore >= 4.2) {
        quality = 'epic';
        emoji = '⚡';
        confidence = 5;
    } else if (combinedScore >= 3.5) {
        quality = 'good';
        emoji = '👌';
        confidence = 4;
    } else if (combinedScore >= 2.5) {
        quality = 'fair';
        emoji = '🤷‍♂️';
        confidence = 3;
    } else if (combinedScore >= 1.5) {
        quality = 'poor';
        emoji = '😬';
        confidence = 2;
    } else {
        quality = 'terrible';
        emoji = '💀';
        confidence = 1;
    }
    
    return { quality, emoji, confidence, score: combinedScore, isFiring };
}

// Generate AI summary text
function generateSummary(windAnalysis, swellAnalysis, tideAnalysis, overallQuality, data) {
    const { waveHeight, wavePeriod, windSpeed, windDirection } = data;
    
    // Special handling for tide-dependent recommendations
    const tideRecommendation = getTideRecommendation(tideAnalysis, windAnalysis, swellAnalysis);
    
    const summaries = {
        firing: [
            `🔥 FIRING! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. This is IT - drop everything and surf NOW!`,
            `🚨 BREAKING: Epic conditions! ${swellAnalysis.text} with ${windAnalysis.text} and ${tideAnalysis.text}. All systems GO!`,
            `⚡ NUCLEAR! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. The stars have aligned - GO SURF!`
        ],
        epic: [
            `⚡ Epic session brewing! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}`,
            `🏄‍♂️ Premium conditions! ${swellAnalysis.description} with ${windAnalysis.description} and ${tideAnalysis.text}. ${tideRecommendation}`,
            `🔥 Solid surf alert! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}`
        ],
        good: [
            `👌 Quality waves ahead! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}`,
            `🌊 Nice conditions brewing! ${swellAnalysis.description} meets ${windAnalysis.description} with ${tideAnalysis.text}. ${tideRecommendation}`,
            `🤙 Solid session potential! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}`
        ],
        fair: [
            `🤷‍♂️ Mixed bag today. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}`,
            `⚖️ So-so conditions. ${swellAnalysis.description} with ${windAnalysis.description} and ${tideAnalysis.text}. ${tideRecommendation}`,
            `🌪️ Challenging surf. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation}`
        ],
        poor: [
            `😬 Rough conditions. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. ${tideRecommendation || 'Maybe check the cam first?'}`,
            `🌊💨 Messy surf today. ${swellAnalysis.description} with ${windAnalysis.description} and ${tideAnalysis.text}. Better days ahead!`,
            `📚 Study session weather. ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Time to wax your board!`
        ],
        terrible: [
            `💀 Gnarly out there! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Stay on the beach!`,
            `⚠️ Danger zone! ${windAnalysis.description} with ${swellAnalysis.description} and ${tideAnalysis.text}. Not surfable!`,
            `🏠 Indoor day! ${swellAnalysis.text}, ${windAnalysis.text}, ${tideAnalysis.text}. Surf movies and planning time!`
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

export default SurfAISummary;