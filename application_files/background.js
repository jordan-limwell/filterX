const HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/";
const LANGUAGE_DETECTION_MODEL = "facebook/fasttext-language-identification";
const ENGLISH_HATE_SPEECH_MODEL = "Hate-speech-CNERG/dehatebert-mono-english";
const TAGALOG_HATE_SPEECH_MODEL = "ggpt1006/tl-hatespeech-detection";
const COLD_START_RETRY_DELAY = 30000; // 30 seconds delay for cold start retries
const MAX_TOKEN_LENGTH = 512; // Maximum length allowed for the models
const CONCURRENCY_LIMIT = 5; // Limit for concurrent requests
var hateSpeechMap = {};

// Log levels: 0 = no logs, 1 = error, 2 = warn, 3 = info, 4 = debug
let logLevel = 3;

// Logging utility function
function log(level, message, ...optionalParams) {
    if (level <= logLevel) {
        switch (level) {
            case 1:
                console.error(message, ...optionalParams);
                break;
            case 2:
                console.warn(message, ...optionalParams);
                break;
            case 3:
                console.info(message, ...optionalParams);
                break;
            case 4:
                console.debug(message, ...optionalParams);
                break;
        }
    }
}


// Helper function to call Hugging Face API
async function callHuggingFaceAPI(model, sentence) {
    try {
        const truncatedSentence = truncateToMaxTokens(sentence, MAX_TOKEN_LENGTH);
        log(4, `Sending request to model: ${model}`, { inputs: truncatedSentence });

        const response = await fetch(`${HUGGINGFACE_API_URL}${model}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ inputs: truncatedSentence }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        log(4, `Response from model: ${model}`, result);
        return result && result[0] ? result[0] : null;
    } catch (error) {
        log(1, "API request failed: ", error.message);
        throw error;
    }
}

// Function to truncate the sentence to the max token limit
function truncateToMaxTokens(text, maxLength) {
    const words = text.split(/\s+/);
    return words.length > maxLength ? words.slice(0, maxLength).join(' ') : text;
}

// Throttling: Send a limited number of concurrent requests
async function throttlePromises(tasks, concurrencyLimit) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
        const p = task().then(result => {
            executing.splice(executing.indexOf(p), 1);
            return result;
        });
        results.push(p);
        executing.push(p);

        if (executing.length >= concurrencyLimit) {
            await Promise.race(executing);
        }
    }

    return Promise.all(results);
}

async function detectLanguage(sentence) {
    const result = await callHuggingFaceAPI(LANGUAGE_DETECTION_MODEL, sentence);
    let language = "english"; // Default to 'english' if no specific language is detected

    if (result && result.length > 0) {
        const isFilipinoLanguage = result.some(pred => 
            ["tgl_Latn", "ceb_Latn", "war_Latn"].includes(pred.label) && pred.score > 0.1 //tagalog, cebuano, waray
        );
        const isEnglish = result.some(pred => pred.label === "eng_Latn" && pred.score > 0.1);

        if (isFilipinoLanguage) {
            language = "tagalog";
        } else if (isEnglish) {
            language = "english";
        }
    }

    log(3, `Sentence: "${sentence}"`, 
        `Language Prediction: ${language}`, 
        `Where API was sent: ${LANGUAGE_DETECTION_MODEL}`
    );

    return language;
}

// Group sentences by detected language
async function groupByLanguage(sentences) {
    const englishGroup = [];
    const tagalogGroup = [];

    const tasks = sentences.map(sentence => async () => {
        const language = await detectLanguage(sentence);
        if (language === "english") {
            englishGroup.push(sentence);
        } else {
            tagalogGroup.push(sentence);
        }
    });

    await throttlePromises(tasks, CONCURRENCY_LIMIT);
    return { englishGroup, tagalogGroup };
}

let currentMode = 'moderate'; // Default to 'free' mode if nothing is set

// Listener for receiving mode changes from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setMode') {
        currentMode = message.mode;
        console.log(`Mode changed to: ${currentMode}`);
    }
});

function getModeThreshold() {
    let threshold;

    switch (currentMode) {
        case 'strict':
            threshold = 0.6;
            break;
        case 'moderate':
            threshold = 0.8;
            break;
        case 'free':
        default:
            threshold = 0.9;
            break;
    }
    return threshold;
}

async function callHateSpeechAPI(model, sentence) {
    console.time("API call");
    const prediction = await callHuggingFaceAPI(model, sentence);
    console.timeEnd("API call");
    
    // Get the threshold based on the selected mode
    const threshold = getModeThreshold();
    
    // Log API prediction details and apply threshold
    log(3, `Sentence: "${sentence}"`, 
        `Where API was sent: ${model}`,
        `API Prediction: ${JSON.stringify(prediction)}`,
        `Mode Threshold: ${threshold}`
    );

    // Check if it's an English or Tagalog model, and apply the threshold to the correct label
    const flagged = prediction.filter(pred => 
        (model === ENGLISH_HATE_SPEECH_MODEL && pred.label === "HATE" && pred.score >= threshold) ||
        (model === TAGALOG_HATE_SPEECH_MODEL && pred.label === "LABEL_1" && pred.score >= threshold)
    );

    if (flagged.length > 0) {
        log(3, `Flagged as hate speech:`, JSON.stringify(flagged));
        return flagged;
    } else {
        // Log if the sentence is marked as non-hate speech because the score is below the threshold
        log(3, `Prediction below threshold (${threshold}). Marked as non-hate speech:`, 
            `Sentence: "${sentence}"`, 
            `Prediction score: ${prediction[0]?.score || 'N/A'}`);

        // Return the prediction (including non-hate speech), not null
        return prediction;  // Ensure the prediction is still returned
    }
}




// Analyze hate speech with throttling and logging
async function analyzeHateSpeechWithThrottling(group, model, concurrencyLimit) {
    const tasks = group.map(sentence => async () => {
        const prediction = await callHateSpeechAPI(model, sentence);
        
        if (prediction && prediction.forEach) {
            prediction.forEach(pred => {
                log(3, `Prediction label: ${pred.label}, Score: ${pred.score}`);
            });
        } else {
            log(2, `No valid prediction for sentence: "${sentence}"`);
        }

        return prediction;
    });

    return throttlePromises(tasks, concurrencyLimit);
}


async function analyzeHateSpeech(englishGroup, tagalogGroup) {
    const results = { english: [], tagalog: [] };

    if (englishGroup.length > 0) {
        log(3, "Sending English sentences for hate speech detection...");
        results.english = await analyzeHateSpeechWithThrottling(
            englishGroup,
            ENGLISH_HATE_SPEECH_MODEL,
            CONCURRENCY_LIMIT
        );
    }

    if (tagalogGroup.length > 0) {
        log(3, "Sending Tagalog sentences for hate speech detection...");
        results.tagalog = await analyzeHateSpeechWithThrottling(
            tagalogGroup,
            TAGALOG_HATE_SPEECH_MODEL,
            CONCURRENCY_LIMIT
        );
    }

    // Apply the threshold based on the current mode
    const threshold = getModeThreshold();

    // Count the hate speech occurrences
    const { englishHateCount, tagalogHateCount } = countHateSpeech(results, threshold);

    log(3, `Hate speech count - English: ${englishHateCount}, Tagalog: ${tagalogHateCount}`);

    return { englishHateCount, tagalogHateCount };
}

// Count hate speeches function, integrated within the existing structure
function countHateSpeech(results, threshold) {
    // Ensure results.english and results.tagalog are arrays, defaulting to empty arrays if undefined
    const englishResults = Array.isArray(results.english) ? results.english : [];
    const tagalogResults = Array.isArray(results.tagalog) ? results.tagalog : [];

    // Count hate speeches in English predictions
    const englishHateCount = englishResults.filter(prediction =>
        Array.isArray(prediction) && prediction.some(pred => pred.label === "HATE" && pred.score >= threshold)
    ).length;

    // Count hate speeches in Tagalog predictions
    const tagalogHateCount = tagalogResults.filter(prediction =>
        Array.isArray(prediction) && prediction.some(pred => pred.label === "LABEL_1" && pred.score >= threshold)
    ).length;

    // Log analysis results
    log(4, "English hate speech analysis results: ", englishResults);
    log(4, "Tagalog hate speech analysis results: ", tagalogResults);

    // Always return an object with both counts
    return {
        englishHateCount: englishHateCount || 0, // Default to 0 if no hate speech found
        tagalogHateCount: tagalogHateCount || 0, // Default to 0 if no hate speech found
    };
}


// Handle waiting (cold start delay)
async function handleColdStart() {
    log(2, "Cold start detected, retrying...");
    await wait(COLD_START_RETRY_DELAY);
    return { scanResult: "coldStart", detectedHateSpeeches: 0 };
}

// Check if the error is due to a cold start
function isColdStartError(error) {
    const coldStartErrors = ["503", "timeout", "Gateway Timeout"];
    return coldStartErrors.some(err => error.message.includes(err));
}

// Process sentences collected from content script
async function processSentences(sentences) {
    const { englishGroup, tagalogGroup } = await groupByLanguage(sentences);
    const { englishHateCount, tagalogHateCount } = await analyzeHateSpeech(englishGroup, tagalogGroup);

    const detectedHateSpeeches = englishHateCount + tagalogHateCount;

    return { detectedHateSpeeches, englishHateCount, tagalogHateCount }; 
}

// Wait function
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processSentencesInLoop(sentences) {
    // Group sentences by detected language first
    const { englishGroup, tagalogGroup } = await groupByLanguage(sentences);

    // Create an array to hold all processing tasks
    const tasks = [];

    // Process English sentences
    for (const sentence of englishGroup) {
        tasks.push(async () => {
            const prediction = await callHateSpeechAPI(ENGLISH_HATE_SPEECH_MODEL, sentence);
            const flagged = prediction.filter(pred => pred.label === "HATE" && pred.score >= getModeThreshold());
            if (flagged.length > 0) {
                hateSpeechMap[sentence] = flagged; // Store the sentence and its predictions
            }
            return { sentence, prediction: flagged.length > 0 ? flagged : null };
        });
    }

    // Process Tagalog sentences
    for (const sentence of tagalogGroup) {
        tasks.push(async () => {
            const prediction = await callHateSpeechAPI(TAGALOG_HATE_SPEECH_MODEL, sentence);
            const flagged = prediction.filter(pred => pred.label === "LABEL_1" && pred.score >= getModeThreshold());
            if (flagged.length > 0) {
                hateSpeechMap[sentence] = flagged; // Store the sentence and its predictions
            }
            return { sentence, prediction: flagged.length > 0 ? flagged : null };
        });
    }

    // Execute tasks with throttling
    const results = await throttlePromises(tasks, CONCURRENCY_LIMIT);

    // Log the results
    results.forEach(result => {
        if (result.prediction) {
            log(3, `Processed sentence: "${result.sentence}", Flagged as hate speech: ${JSON.stringify(result.prediction)}`);
        } else {
            log(3, `Processed sentence: "${result.sentence}", No hate speech detected.`);
        }
    });

    return results;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scanPage") {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "scanPage" }, async (response) => {
                if (response && response.sentences) {
                    log(3, "Collected sentences: ", response.sentences);
                    

                    try {

                        const hateSpeechResults = await processSentencesInLoop(response.sentences);

                        const hateSpeechCount = await processSentences(response.sentences);
                        sendResponse({ scanResult: "success", detectedHateSpeeches: hateSpeechCount, hateSpeechMap });
                    } catch (error) {
                        if (isColdStartError(error)) {
                            const coldStartResponse = await handleColdStart();
                            sendResponse(coldStartResponse);
                        } else {
                            log(1, "Error processing sentences: ", error.message);
                            sendResponse({ scanResult: "maxAttempts", detectedHateSpeeches: 0 });
                        }
                    }
                } else {
                    log(1, "No response from content script");
                    sendResponse({ scanResult: "maxAttempts", detectedHateSpeeches: 0 });
                }
            });
        });
        return true;
    }
});


let notifCount = 0;
let totalSentencesCount = 0; // Track total number of sentences

let enHateCount = 0;
let tlHateCount = 0;

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "processSentence" && request.sentence) {
        try {
            totalSentencesCount++; // Increment total sentences count
            
            // Detect language and process sentence for hate speech
            const language = await detectLanguage(request.sentence);
            let model = language === "english" ? ENGLISH_HATE_SPEECH_MODEL : TAGALOG_HATE_SPEECH_MODEL;
            const prediction = await callHateSpeechAPI(model, request.sentence);

            const threshold = getModeThreshold();
            const isFlagged = prediction.some(pred =>
                (model === ENGLISH_HATE_SPEECH_MODEL && pred.label === "HATE" && pred.score >= threshold) ||
                (model === TAGALOG_HATE_SPEECH_MODEL && pred.label === "LABEL_1" && pred.score >= threshold)
            );

            if (isFlagged) {
                notifCount++;

                if (language === "english") {
                    enHateCount++;
                } else if (language === "tagalog") {
                    tlHateCount++;
                }
                chrome.runtime.sendMessage({
                    action: "updateBadge",
                    count: notifCount,
                    flaggedSentence: request.sentence,
                    timestamp: Date.now()
                });
            }

            chrome.runtime.sendMessage({
                action: "updateStatistics",
                totalSentences: totalSentencesCount,
                flaggedSentences: notifCount,
                englishHateCount: enHateCount,
                tagalogHateCount: tlHateCount 
            });            

            sendResponse({ status: "success", sentence: request.sentence, result: isFlagged ? "FLAGGED" : "NOT FLAGGED" });
        } catch (error) {
            sendResponse({ status: "error", error: error.message });
        }
        return true;
    }
});



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    let keepAlive = true;
    const keepAliveInterval = setInterval(() => {
        if (!keepAlive) clearInterval(keepAliveInterval);
    }, 1000); // Keeps service worker alive

    (async () => {
        try {
            console.log("Received message in background:", request);

            if (request.action === "processChatMessage" && request.sentence) {
                console.log("Starting to process sentence:", request.sentence);

                const language = await detectLanguage(request.sentence);
                console.log("Detected language:", language);

                let model = language === "english" ? ENGLISH_HATE_SPEECH_MODEL : TAGALOG_HATE_SPEECH_MODEL;
                
                try {
                    const prediction = await callHateSpeechAPI(model, request.sentence);
                    console.log("Prediction result:", prediction);
                    sendResponse({ status: "success", predictionResult: prediction });
                } catch (error) {
                    if (isColdStartError(error)) {
                        console.error("Cold start error:", error);
                        sendResponse({ status: "coldStart" });
                    } else if (error.message.includes("token limit")) {
                        console.error("Max token error:", error);
                        sendResponse({ status: "maxToken" });
                    } else {
                        throw error; // Rethrow other errors
                    }
                }
            }
        } catch (error) {
            console.error("Error during message processing:", error);
            sendResponse({ status: "error", message: error.message });
        } finally {
            keepAlive = false;  // Allow service worker to shut down
        }
    })();

    return true;  // Keep message channel open for async response
});
