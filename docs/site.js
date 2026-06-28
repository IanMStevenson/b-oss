(function () {
  const dialog = document.createElement('dialog');
  dialog.id = 'img-lightbox';
  dialog.innerHTML =
    '<button class="lightbox-close" aria-label="Close">×</button><img alt="" />';
  document.body.appendChild(dialog);

  const lightboxImg = dialog.querySelector('img');

  dialog.querySelector('.lightbox-close').addEventListener('click', function () {
    dialog.close();
  });

  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close();
  });

  document.querySelectorAll('.prose figure img').forEach(function (img) {
    function applySize() {
      if (img.naturalWidth) img.style.width = Math.round(img.naturalWidth * 0.66) + 'px';
    }
    if (img.complete) {
      applySize();
    } else {
      img.addEventListener('load', applySize);
    }

    img.addEventListener('click', function () {
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      dialog.showModal();
    });
  });
})();
