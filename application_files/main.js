document.addEventListener("DOMContentLoaded", function() {
    const scanPageButton = document.getElementById('scanPage');
    const modalContent = document.getElementById("modalContent");

    const scanToggle = document.getElementById("scanToggle");

    const userInput = document.getElementById("user-input");
    const sendMessageButton = document.getElementById("send-message");
    const chatMessages = document.getElementById("chat-messages");

    const strictMode = document.getElementById('strictMode');
    const moderateMode = document.getElementById('moderateMode');
    const freeMode = document.getElementById('freeMode');

    const hideSwitch = document.getElementById('hideSwitch');
    const uncensoredSwitch = document.getElementById('uncensoredSwitch');
    const highlightSwitch = document.getElementById('highlightSwitch');
    var hateSpeechMap = {};
    const defaultFalse = false;

    const startupMessage = "Type a sentence and I will try to determine whether it is hate speech or not!";

    // if (!scanPageButton || !modalContent || !scanToggle || !userInput || !sendMessageButton || !chatMessages) {
    //     console.error("Some elements not found!");
    //     return;
    // }

    // Event listener for opening the notification card
    document.getElementById("notifBtn").addEventListener("click", function() {
        const notifCard = document.getElementById("notifCard");
        const isCardVisible = notifCard.style.display === "block";
        notifCard.style.display = isCardVisible ? "none" : "block";

        // Only update the timeAgo when the card is shown (reopened)
        if (!isCardVisible) {
            updateNotificationsTimeAgo();
            const notifBadge = document.querySelector(".nav__notif .notif__badge");
            notifBadge.innerHTML = "0"; // Reset the badge count to 0
        }
    });

     // Hide card when clicking outside
     document.addEventListener("click", function(event) {
        const notifCard = document.getElementById("notifCard");
        const notifBtn = document.getElementById("notifBtn");
        if (!notifCard.contains(event.target) && !notifBtn.contains(event.target)) {
            notifCard.style.display = "none";
        }
    });

          // Update badge and notification list upon receiving messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateBadge") {
            const notifBadge = document.querySelector(".nav__notif .notif__badge");
            notifBadge.innerHTML = request.count > 99 ? "99+" : request.count.toString();

            const notifList = document.querySelector("#notifCard .list-group");
            const defaultMessage = document.getElementById("defaultMessage");

            // Hide the default message if a flagged sentence is added
            if (defaultMessage) {
                defaultMessage.style.display = "none";
            }

            // Ensure current timestamp is stored properly
            const timestamp = Date.now(); // Save the current timestamp
            const timeAgo = getTimeDifference(timestamp); // Calculate timeAgo based on the current time

            // Create new notification item
            const newNotifItem = document.createElement("li");
            newNotifItem.className = "list-group-item";
            newNotifItem.setAttribute('data-timestamp', timestamp); // Store the timestamp for later updates
            newNotifItem.innerHTML = `<em>${request.flaggedSentence}</em> was flagged as hate speech • ${timeAgo}`; // Fix display

            notifList.appendChild(newNotifItem);

            // Log to check if the timestamp is being set correctly
            console.log("Notification created with timestamp: ", timestamp);
        }
    });

    // Function to update the timeAgo for each notification when the card is opened
    function updateNotificationsTimeAgo() {
        const notifItems = document.querySelectorAll("#notifCard .list-group-item");
        notifItems.forEach((item) => {
            const timestamp = Number(item.getAttribute('data-timestamp')); // Ensure the timestamp is retrieved as a number

            // Log to ensure the timestamp is being retrieved correctly
            console.log("Updating notification with timestamp: ", timestamp);

            if (timestamp) {
                const timeAgo = getTimeDifference(timestamp); // Calculate the time difference
                const sentence = item.querySelector("em").innerHTML; // Extract the sentence part from the notification

                // Directly update the entire notification message with new timeAgo
                item.innerHTML = `<div class="d-flex justify-content-between align-items-center">
                                <span><em>"${sentence}"</em> was flagged as hate speech. • ${timeAgo}</span>
                                <i class='bx bx-dots-horizontal-rounded fs-1 ms-1'></i>
                            </div>`;

                // Log to check if the timeAgo is being calculated correctly
                console.log("Updated timeAgo: ", timeAgo);
            }
        });
    }

    // Function to calculate time difference
    function getTimeDifference(timestamp) {
        const now = Date.now();
        const diffInSeconds = Math.floor((now - timestamp) / 1000);

        // Log the values for debugging
        console.log("Now:", now, "Timestamp:", timestamp, "Difference in seconds:", diffInSeconds);

        if (diffInSeconds < 60) return `${diffInSeconds}s`;
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}hr`;
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d`;
    }

    
     

     // Listen for changes in mode selection
    document.querySelectorAll('input[name="mode"]').forEach((input) => {
        input.addEventListener('change', (event) => {
            const selectedMode = event.target.value;
            console.log(`Mode selected: ${selectedMode}`);
            chrome.runtime.sendMessage({ action: "setMode", mode: selectedMode });
        });
    });
    
    

    // Event listener for Scan Page button
    scanPageButton.addEventListener('click', () => {
        // Show loading spinner and message
        showLoadingModal(modalContent);

        // Send message to content script to initiate the scan
        chrome.runtime.sendMessage({ action: "scanPage" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error: " + chrome.runtime.lastError.message);
                modalContent.innerHTML = `<p>Could not establish connection. Please refresh the page and try again.</p>`;
            } else {
                hateSpeechMap = response.hateSpeechMap || {};

                handleScanResponse(response, modalContent, hateSpeechMap);

                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "scanPage", hateSpeechMap });
                });
            }
        });
    });

    // Event listener for the scanToggle button
    scanToggle.addEventListener('change', (event) => {
        const toggleState = event.target.checked; // true if checked (on), false if unchecked (off)
        console.log(`scanToggle is now ${toggleState ? 'ON' : 'OFF'}`); // Log the toggle state

        // Disable Scan Page button if the toggle is on, enable it back if off
        scanPageButton.disabled = toggleState;

        // Get the active tab and send a message to content script
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length === 0) {
                console.error('No active tabs found.');
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { action: "toggleObserver", enabled: toggleState });
        });

        // uncensoredSwitch.checked = toggleState;
    });

    hideSwitch.addEventListener('click', () => {  
        const enable = hideSwitch.classList.toggle('enabled');
        const toggleState = event.target.checked;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "toggleCensorship", toggleState, hateSpeechMap });
        });

        if(highlightSwitch.checked) {
            highlightSwitch.checked = false;
        }
    });

    highlightSwitch.addEventListener('click', () => {
        const enable = highlightSwitch.classList.toggle('enabled');
        const toggleState = event.target.checked;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "toggleHighlighted", toggleState, hateSpeechMap });
        });
        
        if(hideSwitch.checked) {
            hideSwitch.checked = false;
        }
    });

    uncensoredSwitch.addEventListener('click', () => {
        const enable = uncensoredSwitch.classList.toggle('enabled');
        const toggleState = event.target.checked;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "toggleCensorshipRealtime", toggleState });
        });
    });

    function displayMessage(sender, message) {
        const container = document.createElement("div");
        container.classList.add("message-container", sender === "user" ? "user-container" : "bot-container");
    
        const messageElement = document.createElement("div");
        messageElement.classList.add("chat-message", sender === "user" ? "user" : "bot");
        messageElement.textContent = message;
    
        if (sender === "bot") {
            const botImage = document.createElement("img");
            botImage.src = "assets/img/fx.png";
            botImage.style.width = "11%";
            botImage.style.height = "auto";
            botImage.style.borderRadius = "50%";
            botImage.style.marginLeft = ".8rem";
            botImage.style.marginRight = ".2rem";
            
            container.appendChild(botImage); // Place bot image to the left
            container.appendChild(messageElement); // Then add message
        } else if (sender === "user") {
            container.appendChild(messageElement); // Add message first for user
    
            const userImage = document.createElement("img");
            userImage.src = "assets/img/user.png";
            userImage.style.width = "11%";
            userImage.style.height = "auto";
            userImage.style.borderRadius = "50%";
            userImage.style.marginRight = ".8rem"; // Space between message and image on the right
            userImage.style.marginRight = ".4rem";
    
            container.appendChild(userImage); // Add user image to the right
        }
    
        chatMessages.appendChild(container);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to bottom
    }
    
    
    
    
    

    async function handleMessage(sentence) {

    
        // Display user's message in the chat
        displayMessage("user", sentence);
        const processedSentence = sentence.toLowerCase();
        
        try {
            chrome.runtime.sendMessage(
                { action: "processChatMessage", sentence: processedSentence },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error: " + chrome.runtime.lastError.message);
                        displayMessage("bot", "Sorry, something went wrong. Please try again.");
                    } else {
                        switch (response.status) {
                            case "success":
                                const predictions = response.predictionResult || [];
                                if (predictions.length > 0) {
                                    const { label, score } = predictions[0];
                                    const isHateSpeech = label === "LABEL_1" ? "hate speech" : "not hate speech";
                                    const confidence = (score * 100).toFixed(2);
                                    const botMessage = `I am ${confidence}% confident that your sentence is ${isHateSpeech}.`;
                                    displayMessage("bot", botMessage);
                                } else {
                                    displayMessage("bot", "No prediction result was found.");
                                }
                                break;
                            case "coldStart":
                                displayMessage("bot", "I fell asleep, it takes about 30 seconds for me to wake up. Please try again.");
                                break;
                            case "maxToken":
                                displayMessage("bot", "Looks like I already used up all the energy developers gave me due to budget. Try again after an hour.");
                                break;
                            default:
                                displayMessage("bot", "Sorry, something went wrong.");
                                break;
                        }
                    }
                }
            );
        } catch (error) {
            console.error("Error in handleMessage:", error);
            displayMessage("bot", "Sorry, something went wrong.");
        }
    }

    displayMessage("bot", startupMessage);
    
    
    

    // Send message on button click
    sendMessageButton.addEventListener("click", function() {
        const sentence = userInput.value.trim();
        if (sentence) {
            handleMessage(sentence);
            userInput.value = "";  // Clear the input field
        }
    });

    // Send message on Enter key press
    userInput.addEventListener("keypress", function(e) {
        if (e.key === "Enter") {
            const sentence = userInput.value.trim();
            if (sentence) {
                handleMessage(sentence);
                userInput.value = "";  // Clear the input field
            }
        }
    });

    // DASHBOARD 

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateStatistics") {
            const totalOccurrencesElement = document.getElementById('totalOccurrences');
            const percentageElement = document.getElementById('hateSpeechPercentage');
            
            const totalSentences = request.totalSentences;
            const flaggedSentences = request.flaggedSentences;
            
            // Update total occurrences
            totalOccurrencesElement.textContent = flaggedSentences;
    
            // Calculate and update the percentage of hate speech
            const percentage = ((flaggedSentences / totalSentences) * 100).toFixed(2);
            percentageElement.innerHTML = `<i class="mdi mdi-arrow-bottom-right"></i> ${percentage}%`;
    
            // Get the hate speech counts for each language
            const enHateCount = request.englishHateCount;  // Fixed variable name
            const tlHateCount = request.tagalogHateCount;  // Fixed variable name
    
            // Update the chart data with actual counts
            totalHateSpeechChart.data.datasets[0].data = [enHateCount, tlHateCount];
            
            // Redraw the chart to reflect updated data
            totalHateSpeechChart.update();
        }
    });
    
    
    

    var ctx = document.getElementById('totalHateSpeechChart').getContext('2d');
    var totalHateSpeechChart = new Chart(ctx, {
        type: 'bar',  // Change chart type to 'bar'
        data: {
            labels: ['English', 'Tagalog'],  // Labels for languages
            datasets: [{
                label: 'Total Hate Speech Detected',
                data: [0, 0],  // Sample data, replace with actual values
                backgroundColor: ['rgb(191, 90, 242)', '#FFA116'],  // Colors for each bar
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,  // Show legend
                    position: 'top',
                    labels: {
                        font: {
                            family: 'Roboto', // Set font to Roboto
                            size: 14
                        },
                        color: '#FFFFFF' // Text color
                    }
                },
                title: {
                    display: true,
                    text: 'Hate Speech Per Language',
                    color: '#FFFFFF',
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Hate Speeches',
                        color: '#FFFFFF',
                    },
                    ticks: {
                        color: '#FFFFFF',
                    }
                },
                x: {
                    ticks: {
                        color: '#FFFFFF',
                    }
                }
            }
        }
    });

 
});


// FUNCTIONS HERE



// Function to toggle off other checkboxes when one is selected
function toggleMode(selectedMode) {
    if (selectedMode === strictMode) {
        moderateMode.checked = false;
        freeMode.checked = false;
    } else if (selectedMode === moderateMode) {
        strictMode.checked = false;
        freeMode.checked = false;
    } else if (selectedMode === freeMode) {
        strictMode.checked = false;
        moderateMode.checked = false;
    }
}

// Add event listeners to checkboxes
strictMode.addEventListener('change', () => toggleMode(strictMode));
moderateMode.addEventListener('change', () => toggleMode(moderateMode));
freeMode.addEventListener('change', () => toggleMode(freeMode));

// Function to toggle off other checkboxes when one is selected
function toggleSwitch(selectedSwitch) {
    if (selectedSwitch === hideSwitch) {
        uncensoredSwitch.checked = false;
        highlightSwitch.checked = false;
    } else if (selectedSwitch === uncensoredSwitch) {
        hideSwitch.checked = false;
        highlightSwitch.checked = false;
    } else if (selectedSwitch === highlightSwitch) {
        hideSwitch.checked = false;
        uncensoredSwitch.checked = false;
    }
}

// Add event listeners to checkboxes
hideSwitch.addEventListener('change', () => toggleSwitch(hideSwitch));
uncensoredSwitch.addEventListener('change', () => toggleSwitch(uncensoredSwitch));
highlightSwitch.addEventListener('change', () => toggleSwitch(highlightSwitch));

// Helper function to show loading spinner
function showLoadingModal(modalContent) {
    modalContent.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class="ms-2">Scanning the page...</div>
        </div>
    `;
}

// Helper function to handle the scan response
function handleScanResponse(response, modalContent, hateSpeechMap) {
    console.log("Response object:", response);

    const scanResult = response.scanResult || ""; 
    const detectedHateSpeeches = response.detectedHateSpeeches.englishHateCount + response.detectedHateSpeeches.tagalogHateCount;
    const englishHateCount = response.detectedHateSpeeches.englishHateCount || 0;
    const tagalogHateCount = response.detectedHateSpeeches.tagalogHateCount || 0;
    

    if (scanResult === "coldStart") {
        modalContent.innerHTML = `
            <div class="alert alert-danger d-flex align-items-center p-2 me-0" role="alert">
                <i class='bx bxs-error-circle fs-1'></i>
                <div class="ms-2 me-2">
                    Cold Start Detected!
                    <button class="btn btn-primary me-2" type="button" id="scanPage" data-bs-toggle="modal" data-bs-target="#resultModal">Retry<i class='bx bx-search fs-2 ms-1'></i></button>
                </div>
            </div>
            <p>Cold start occurs when the API fell asleep... please try again after a few seconds</p>
        `;
    } else if (scanResult === "success") {

        // Dito ko tinetesting 

        let hateSpeechDetails = '';

        // List hate speeches from the hateSpeechMap
        for (const [sentence, predictions] of Object.entries(hateSpeechMap)) {
            hateSpeechDetails += `<p><strong>Sentence:</strong> "${sentence}"<br>`;
            hateSpeechDetails += `<strong>Predictions:</strong> ${predictions.map(pred => `${pred.label} (Score: ${pred.score})`).join(', ')}</p>`;
        
            replaceHateSpeech(sentence);
        }

        modalContent.innerHTML = `
            <div class="alert alert-success d-flex align-items-center p-2 me-0" role="alert">
                <i class='bx bxs-check-circle fs-1'></i>
                <div class="ms-2 me-2">
                    Scan Successful!
                </div>
            </div>
            <p>Detected ${detectedHateSpeeches} instances of hate speech. Total sentences processed: ${Object.keys(hateSpeechMap).length}</p>
            <button class="btn btn-primary justify-content-center- align-items-end" type="button" data-bs-toggle="collapse" data-bs-target="#collapseSuccess" aria-expanded="false" aria-controls="collapseSuccess">
                View Details
            </button>
            <div class="collapse mt-3 mb-3" id="collapseSuccess">
                <div class="card card-body" style="background-color: #423726; color: #AEAAAA max-height: 20vh; overflow-y: auto;">
                    <p>English Hate Speech: ${englishHateCount}</p>
                    <p>Tagalog Hate Speech: ${tagalogHateCount}</p>
                    <p>Hate Speech Details:</p>
                    ${hateSpeechDetails}
                </div>
            </div>
        `;
    } else if (scanResult === "maxAttempts") {
        modalContent.innerHTML = `
            <div class="alert alert-danger d-flex align-items-center p-2 me-0" role="alert">
                <i class='bx bxs-error-circle fs-1'></i>
                <div class="ms-2 me-2">
                    Error Occurred!
                </div>
            </div>
            <p>Error occurred! Please restart the page. If error still occurs please try again later!</p>
        `;
    }
}


function replaceHateSpeech(data) {
    
}
