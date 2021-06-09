export function noRowsOverlay() {}

noRowsOverlay.prototype.init = function(params) {
  this.overlay = document.createElement('div');
  this.overlay.innerHTML =
    '<div class="ag-overlay-loading-center" style="background-color: lightcoral; height: 9%">' +
    'There are currently no rows. Right click on the grid to add rows. If you haven\'t added a column yet, that can be done from the same menu.' +
    '</div>';
};

noRowsOverlay.prototype.getGui = function() {
  return this.overlay;
};