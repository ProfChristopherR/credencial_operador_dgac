/**
 * ============================================
   QUIZ INTERACTIVO - DGAC Drones
   Evaluación final con retroalimentación
   ============================================
 */

(function() {
  'use strict';

  const feedbackMessages = {
    correct: [
      '¡Correcto! Dominas este concepto clave.',
      '¡Excelente! Respuesta acertada.',
      '¡Muy bien! Sigue así.',
      '¡Perfecto! Respuesta correcta.'
    ],
    incorrect: [
      'Incorrecto. Revisa el contenido de la clase asociada.',
      'No es la respuesta correcta. Intenta de nuevo.',
      'Revisa el concepto antes de continuar.',
      'Respuesta errónea. Vuelve a estudiar este tema.'
    ]
  };

  function checkAnswer(button) {
    const question = button.closest('.quiz-question');
    if (!question) return;

    const correctValue = question.dataset.correct;
    const selected = question.querySelector('input[type="radio"]:checked');
    const feedback = question.querySelector('.quiz-feedback');

    if (!selected) {
      if (feedback) {
        feedback.textContent = 'Por favor selecciona una alternativa.';
        feedback.className = 'quiz-feedback incorrect';
      }
      return;
    }

    const isCorrect = selected.value === correctValue;
    const messages = isCorrect ? feedbackMessages.correct : feedbackMessages.incorrect;
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];

    if (feedback) {
      feedback.textContent = randomMsg;
      feedback.className = `quiz-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    }

    // Deshabilitar opciones después de responder
    const options = question.querySelectorAll('input[type="radio"]');
    options.forEach(opt => opt.disabled = true);
    button.disabled = true;
    button.textContent = isCorrect ? '✓ Correcto' : '✗ Revisar';
    button.style.opacity = '0.7';

    updateScore();
  }

  function updateScore() {
    const questions = document.querySelectorAll('.quiz-question');
    let answered = 0;
    let correct = 0;

    questions.forEach(q => {
      const selected = q.querySelector('input[type="radio"]:checked');
      if (selected) {
        answered++;
        if (selected.value === q.dataset.correct) correct++;
      }
    });

    const scoreText = document.getElementById('score-text');
    if (scoreText) {
      if (answered === 0) {
        scoreText.textContent = 'Responde todas las preguntas para ver tu puntaje.';
      } else {
        const percentage = Math.round((correct / answered) * 100);
        const total = questions.length;
        scoreText.innerHTML = `
          <span style="color: var(--success); font-weight: 700;">${correct}</span> correctas de 
          <span style="font-weight: 700;">${answered}</span> respondidas 
          (${percentage}% acierto) — Total: ${total} preguntas
        `;
      }
    }
  }

  // Exponer funciones globalmente
  window.checkAnswer = checkAnswer;
  window.updateScore = updateScore;
})();
