// main.js - 自動重構版（含註解 + 完整重構函式）

let cachedExplanationsDocument = null;

import { 
    subjects, criminalLawGeneralUnits, criminalLawSpecificUnits, 
    generalPartChaptersMap, specificPartChaptersMap, quizFileMap
} from './data.js';

// --- DOM 元素容器 ---
let currentExplanationBasePath = ''; 
let setupContainer, quizContainer, startQuizBtn, subjectSelect, modeSelect,
    unitSelectContainer, unitSelect, unitLabel, chapterFromUnitSelectContainer,
    chapterFromUnitSelect, questionQuantityContainer, questionQuantitySelect,
    endQuizModal, mainTitle;

let currentQuestions = [];
let currentQuestionIndex = 0, correctCount = 0, wrongCount = 0, scorePoints = 0, completedCount = 0;
let isInReviewMode = false;

// --- 主程式入口 ---
document.addEventListener('DOMContentLoaded', () => {
    initDomElements();
    bindSetupEvents();
    restoreUserPreferences();
    updateModeAndChapterSelectors();
});

function initDomElements() {
    setupContainer = getById("setup-container");
    quizContainer = getById("quiz-container");
    startQuizBtn = getById("start-quiz-btn");
    subjectSelect = getById("subject-select");
    modeSelect = getById("mode-select");
    unitSelectContainer = getById("unit-select-container");
    unitSelect = getById("unit-select");
    unitLabel = getById("unit-label");
    chapterFromUnitSelectContainer = getById("chapter-from-unit-select-container");
    chapterFromUnitSelect = getById("chapter-from-unit-select");
    questionQuantityContainer = getById("question-quantity-container");
    questionQuantitySelect = getById("question-quantity-select");
    endQuizModal = getById("end-quiz-modal");
    mainTitle = getById("main-title");
    bindQuizControlEvents();
}

function bindSetupEvents() {
    subjectSelect.addEventListener("change", updateModeAndChapterSelectors);
    modeSelect.addEventListener("change", updateModeAndChapterSelectors);
    unitSelect.addEventListener("change", updateUnitChapters);
    startQuizBtn.addEventListener("click", startQuiz);
}

function restoreUserPreferences() {
    populateDropdown(subjectSelect, subjects.map(s => s.name));
    const savedSubject = localStorage.getItem('selectedSubject');
    if (savedSubject) subjectSelect.value = savedSubject;
    const savedQuantity = localStorage.getItem('selectedQuantity');
    if (savedQuantity) questionQuantitySelect.value = savedQuantity;
}

function bindQuizControlEvents() {
    onClick("prev-btn", previousQuestion);
    onClick("next-btn", nextQuestion);
    onClick("explanation-btn", toggleExplanation);
    onClick("calculate-btn", showEndQuizModal);
    onClick("reset-btn", returnToSetupScreen);

    onClick("review-all-btn", () => {
        hide(endQuizModal);
        startReviewMode(currentQuestions);
    });

    onClick("review-wrong-btn", () => {
        hide(endQuizModal);
        const wrongOnly = currentQuestions.filter(q => q.userAttempt && !q.userAttempt.wasCorrect);
        if (wrongOnly.length === 0) return alert("恭喜您，全部答對！");
        isInReviewMode = true;
        initializeQuiz(wrongOnly, true);
    });

    onClick("finish-quiz-btn", () => {
        hide(endQuizModal);
        returnToSetupScreen();
    });
}

async function startQuiz() {
    hide(mainTitle);
    hide(setupContainer);
    startQuizBtn.disabled = true;
    startQuizBtn.textContent = '題庫載入中...';

    const selectedSubject = subjectSelect.value;
    const selectedMode = modeSelect.value;
    const selectedUnit = unitSelect.value; 
    const selectedChapter = chapterFromUnitSelect.value;
    currentExplanationBasePath = '';

    try {
        let questionsData = [];
        if (selectedMode === '隨機出題(參考書)') {
            questionsData = await fetchJson('刑法/參考書/總則+分則.json');
            currentExplanationBasePath = 'explanations/刑法參考書/總則/';

        } else if (selectedSubject === '刑法' && selectedMode.includes('(試題)')) {
            const key = `${selectedUnit}|${selectedChapter}`;
            const task = quizFileMap.get(key);
            if (!task) throw new Error(`題庫路徑未定義: ${key}`);
            const all = await fetchJson(task.file);
            questionsData = task.filter?.type === 'id_prefix'
                ? all.filter(q => q.id?.startsWith(task.filter.prefix.replace(/^第.*?章-/, '')))
                : all;
            currentExplanationBasePath = selectedMode.includes('總則')
                ? 'explanations/刑法參考書/總則/'
                : 'explanations/刑法參考書/分則/';

        } else {
            const subjectInfo = subjects.find(s => s.name === selectedSubject);
            questionsData = await fetchJson(subjectInfo.file);
        }

        initializeQuiz(questionsData, true);
        quizContainer.style.display = 'block';
        localStorage.setItem('selectedSubject', selectedSubject);

    } catch (err) {
        alert(`載入錯誤: ${err.message}`);
        returnToSetupScreen();
    }
}

function initializeQuiz(questionsData, isNewQuiz = false) {
    let questions = isNewQuiz ? JSON.parse(JSON.stringify(questionsData)) : questionsData;

    if (isNewQuiz && !isInReviewMode) {
        shuffleArray(questions);
        const maxQ = parseInt(questionQuantitySelect.value, 10);
        if (questions.length > maxQ) questions = questions.slice(0, maxQ);
    }

    questions.forEach(q => {
        q.userAttempt = { answered: false, choiceIndex: null, wasCorrect: null };
        delete q.shuffledOptions;
    });

    currentQuestions = questions;
    currentQuestionIndex = 0;
    correctCount = wrongCount = scorePoints = completedCount = 0;

    if (questions.length === 0) {
        const box = document.querySelector(".question-box");
        if (box) box.innerHTML = "<p>沒有題目可供練習。</p>";
    } else {
        showQuestion();
    }
}

function showQuestion() {
    quizContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const box = document.querySelector(".question-box");
    const result = getById("result");
    const q = currentQuestions[currentQuestionIndex];
    if (!box || !result) return;

    result.style.display = 'none';
    const explBtn = getById("explanation-btn");
    if (explBtn) explBtn.textContent = "看解析";
    if (!isInReviewMode) updateScore();

    box.innerHTML = `<p class="question-text"><strong>Q${currentQuestionIndex + 1}：</strong>${q.question}</p><hr>`;
    const container = document.createElement("div");
    box.appendChild(container);

    if (!q.shuffledOptions) q.shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);

    q.shuffledOptions.forEach(opt => {
        const div = document.createElement("div");
        div.className = "option";
        div.textContent = opt;
        div.dataset.originalText = opt;
        container.appendChild(div);
        div.addEventListener("click", () => handleOptionClick(div));
    });

    updateButtonStates();
    if (q.userAttempt.answered) showAnswerResult();
}

function handleOptionClick(selectedDiv) {
    const q = currentQuestions[currentQuestionIndex];
    if (isInReviewMode || q.userAttempt.answered) return;

    const original = selectedDiv.dataset.originalText;
    const idx = q.options.indexOf(original);
    q.userAttempt = { answered: true, choiceIndex: idx, wasCorrect: idx === q.answer };

    if (q.userAttempt.wasCorrect) {
        correctCount++;
        scorePoints += (100 / currentQuestions.length);
    } else {
        wrongCount++;
    }
    completedCount++;
    showAnswerResult();
    updateScore();
    updateButtonStates();
}

function showAnswerResult() {
    const q = currentQuestions[currentQuestionIndex];
    const options = document.querySelector(".question-box > div");
    if (!options) return;

    [...options.children].forEach(el => {
        const original = el.dataset.originalText;
        const idx = q.options.indexOf(original);
        if (idx === q.answer) el.classList.add("correct");
        if (idx === q.userAttempt.choiceIndex && !q.userAttempt.wasCorrect) el.classList.add("incorrect");
    });
}

function toggleExplanation() {
    const result = getById("result");
    const q = currentQuestions[currentQuestionIndex];
    const btn = getById("explanation-btn");
    if (!result || !q || !btn) return;

    if (result.style.display !== 'none') {
        result.style.display = 'none';
        btn.textContent = '看解析';
        return;
    }

    result.innerHTML = '正在載入解析...';
    result.style.display = 'block';
    btn.textContent = '隱藏解析';

    if (currentExplanationBasePath && q.id) {
        const path = `${currentExplanationBasePath}${q.id}.html`;
        fetch(path)
            .then(r => r.ok ? r.text() : Promise.reject(path))
            .then(html => result.innerHTML = html)
            .catch(() => result.innerHTML = `<p style="color:red">找不到外部解析。</p>`);
    } else {
        result.innerHTML = q.explanation?.trim() || '<p>此題目未提供解析。</p>';
    }
}

function updateScore() {
    const el = getById("score");
    if (el) el.textContent = `✔️ 答對：${correctCount} 題　❌ 答錯：${wrongCount} 題　總分：${scorePoints.toFixed(2)} 分 (已完成 ${completedCount} / ${currentQuestions.length} 題)`;
}

function nextQuestion() {
    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        showQuestion();
    } else if (!isInReviewMode) {
        showEndQuizModal();
    }
}

function previousQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        showQuestion();
    }
}

function showEndQuizModal() {
    const summary = getById("modal-score-summary");
    if (summary) summary.textContent = `最終得分：${scorePoints.toFixed(2)}分 (答對 ${correctCount} 題 / 答錯 ${wrongCount} 題)`;
    if (endQuizModal) endQuizModal.style.display = 'flex';
}

function returnToSetupScreen() {
    mainTitle.style.display = 'block';
    setupContainer.style.display = 'flex';
    quizContainer.style.display = 'none';
    endQuizModal.style.display = 'none';
    startQuizBtn.disabled = false;
    startQuizBtn.textContent = '開始作答';
}

function updateButtonStates() {
    const prev = getById("prev-btn");
    const next = getById("next-btn");
    const calc = getById("calculate-btn");
    const reset = getById("reset-btn");
    const expl = getById("explanation-btn");
    if (!prev || !next || !calc || !reset || !expl) return;

    expl.disabled = false;
    prev.disabled = currentQuestionIndex === 0;
    const q = currentQuestions[currentQuestionIndex];

    if (isInReviewMode) {
        reset.textContent = "結束檢討";
        next.disabled = currentQuestionIndex === currentQuestions.length - 1;
        calc.style.display = 'none';
    } else {
        reset.textContent = "返回選單";
        next.disabled = !q.userAttempt.answered || currentQuestionIndex === currentQuestions.length - 1;
        if (completedCount === currentQuestions.length) {
            next.style.display = "none";
            calc.style.display = "grid";
            calc.disabled = false;
        } else {
            next.style.display = "grid";
            calc.style.display = 'none';
        }
    }
}

function startReviewMode(questions) {
    isInReviewMode = true;
    initializeQuiz(questions, false);
    const score = getById("score");
    if (score) score.textContent = "試卷檢討模式";
    const next = getById("next-btn");
    if (next) next.textContent = "下一題";
    const calc = getById("calculate-btn");
    if (calc) calc.style.display = "none";
    const reset = getById("reset-btn");
    if (reset) reset.textContent = "結束檢討";
}

function getById(id) {
    return document.getElementById(id);
}

function onClick(id, handler) {
    const el = getById(id);
    if (el) el.addEventListener('click', handler);
}

function hide(el) {
    if (el) el.style.display = 'none';
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`錯誤 ${res.status}: ${path}`);
    return res.json();
}
