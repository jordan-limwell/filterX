# 🛡️ FilterX: A Web Extension for Moderating Online Hate Speech

This project presents **FilterX**, a multilingual browser extension built to detect and filter hate speech in real-time. Integrating state-of-the-art machine learning models, the tool provides a proactive solution for improving digital safety and promoting healthier online communities.

Developed as part of a thesis in fulfillment of the **Bachelor of Science in Computer Science** at STI College Balagtas, FilterX demonstrates how natural language processing (NLP) and browser technologies can be fused to address modern social issues.

🏆 **Awarded Most Outstanding Thesis (School-Level) – STI Graduation 2025**

---

## 🌐 Overview

### 📌 Project Highlights

- Real-time hate speech detection via a Chrome extension.
- Multilingual model support: English and Filipino.
- Integration with both local and HuggingFace-hosted APIs.
- Adaptive UI with real-time notification and censorship options.
- Conducted pre-test/post-test evaluation to assess impact on users.

---

## 🧠 Project Objectives

### 🎯 General Goal

Develop a browser extension for detecting and filtering hate speech in real-time, compatible with major Chromium-based browsers.

### ✅ Specific Goals

**Model Level:**

- Fast and accurate predictions (under 50ms inference time).
- Support for multilingual hate speech classification.
- Capable of generalizing across different websites.

**Extension Level:**

- Real-time scanning and user-controlled censorship.
- Manual input testing & feedback reporting.
- Adjustable filter potency and transparency.

---

## ⚙️ Architecture & Tech Stack

### 🔍 Core Technologies

| Layer         | Tools/Frameworks                                     |
|---------------|------------------------------------------------------|
| Modeling      | Python, Transformers, Scikit-learn, RoBERTa, ELECTRA |
| Frontend      | HTML, CSS, JavaScript                                |
| Backend       | FastAPI, Uvicorn                                     |
| Deployment    | HuggingFace Hub (API), Local API                     |

### 🧩 Extension Components

- **Content Script**: Extracts webpage content.
- **Background Script**: Sends requests and handles responses.
- **FastAPI Server**: Performs inference and returns results.
- **Popup UI**: Allows user interaction, settings, and controls.

---

## 📈 Data and Model Experiments

### 📁 Datasets Used

- `hate_speech_filipino` – Jan Christian Cruz  
- `multilabel-tagalog-hate-speech` – syke9p3  
- `tagalog-profanity-dataset` – mginoben

### 📊 Preprocessing Steps

- Lowercasing
- Removing special characters/newlines
- Balancing dataset via oversampling

### 🧪 Model Experiments

| Embedding    | Classifier              | Accuracy | F1 Score | AUC  |
|--------------|--------------------------|----------|----------|------|
| Word2Vec     | Logistic Regression       | 74%      | 74%      | 82%  |
| ELECTRA      | LightGBM                 | 79%      | 81%      | 87%  |
| RoBERTa      | RoBERTaSequenceClassifier| **85%**  | **84%**  | **92%** |

✅ **Final Model Selected**: RoBERTa (best performance vs latency)

### ⏱️ Inference Time

| Model                       | Avg Time (ms)      |
|----------------------------|--------------------|
| Word2Vec + LogisticReg     | 0.13 ± 0.03 ms     |
| Word2Vec + Random Forest   | 5.97 ± 2.79 ms     |
| ELECTRA + LightGBM         | 0.80 ± 0.03 ms     |
| RoBERTa Sequence Classifier| 15.10 ± 0.13 ms    |

---

## 💻 Features

- ✅ Real-time hate speech detection
- 🌐 Filipino + English language support
- ⚙️ Manual input for custom predictions
- 📊 Dashboard for detection summaries
- 🎛️ Adjustable sensitivity controls
- 📢 Notifications when hate speech is detected
- ✉️ User feedback and reporting mechanism

---

## 🧪 Evaluation & Results

### 📋 Methodology

- Pre-test and Post-test with 20 student participants
- Paired t-tests and Cohen’s d for statistical significance

### 📉 Summary of Findings

| Metric                         | Result                            |
|--------------------------------|-----------------------------------|
| Avg improvement (10 items)     | Large effect sizes (d ≥ 0.8)      |
| Significance                   | p < 0.05 on most test items       |
| User comfort and awareness     | ✅ Improved significantly          |

---

## 📂 Repository Structure

