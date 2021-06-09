import {errorHandler} from '../utility/utility';

/*
  The sections of commented out code are remnants from attempts to allow
  excel-like functionality where you could click on the header or cells while
  editing a cell to automatically add them to the cell's value, but I ditched it
  for now
*/

// custom header to allow column selection
export function CustomHeader() {
}

CustomHeader.prototype.init = function(params) {
  this.params = params;

  // create the look of the column header
  this.columnHeader = document.createElement('div');

  if (this.params.column.colId === this.params.context.COSMETIC_ID) {
    this.columnHeader.innerHTML = '' +
        '<div class="customHeaderLabel">' + this.params.displayName + '</div>' +
        '<div class="customExpandLabel"><i class="fa fa-angle-right"></i></div>' +
        '<div class="customCompressLabel"><i class="fa fa-angle-left"></i></div>';

    this.expandButton = this.columnHeader.querySelector('.customExpandLabel');
    this.compressButton = this.columnHeader.querySelector('.customCompressLabel');
    // had to add this to force the display to none. For some reason it isn't
    // setting display to none based on the css, but it is changing the padding.
    this.compressButton.style.display = 'none';

    this.expandButton.addEventListener('click', this.onExpandButtonListener.bind(this));
    this.compressButton.addEventListener('click', this.onCompressButtonListener.bind(this));
  } else {
    this.columnHeader.innerHTML = '' +
        '<div class="customHeaderLabel">' + this.params.displayName + '</div>' +
        '<div class="customHeaderMenuButton"><i class="fa fa-bars"></i></div>';
    this.columnHeader.setAttribute('id', 'column-header-container-' + this.params.column.colId);

    this.columnHeader.setAttribute('isediting', 'false');
    this.columnHeader.addEventListener('click', this.onHeaderClickListener.bind(this));

    // listen for clicks on header
    this.headerLabel = this.columnHeader.querySelector('.customHeaderLabel');

    // Listen for menu button
    this.menuButton = this.columnHeader.querySelector('.customHeaderMenuButton');

    if (this.params.enableMenu) {
      this.onMenuClickListener = this.onMenuClick.bind(this);
      this.menuButton.addEventListener('click', this.onMenuClickListener);
    } else {
      this.columnHeader.removeChild(this.menuButton);
    }
  }
};

// gets called once when grid ready to insert the element
CustomHeader.prototype.getGui = function() {
  return this.columnHeader;
};

// When clicked, if ctrl is held down, simply add to selections. If ctrl is not
// held down, then remove all other selections.
CustomHeader.prototype.onHeaderClickListener = function(event) {
  const setColumnHighlighting = (ctrlKey) => {
    const columns = this.params.columnApi.getAllDisplayedVirtualColumns();

    // if ctrl is held down we just add the new color. If not, remove all other
    // column colors and then apply the new one.
    columns.forEach((column) => {
      if (column.colId === this.params.column.colId) {
        if (ctrlKey === true) {
          const element = document.querySelector('div[col-id=' + column.colId + ']');
          element.classList.add('header-selected');
        } else {
          columns.forEach((column) => {
            const element = document.querySelector('div[col-id=' + column.colId + ']');
            element.classList.remove('header-selected');
          });

          const element = document.querySelector('div[col-id=' + column.colId + ']');
          element.classList.add('header-selected');
        }
      }
    });
  };

  const setRangeSelectionForColumn = () => {
    const gridOptions = this.params.context.gridOptions;
    const colId = this.params.column.colId;

    if (event.ctrlKey === true) {
      gridOptions.api.addCellRange({
        rowStartIndex: 0,
        rowEndIndex: gridOptions.api.getDisplayedRowCount() - 1,
        columnStart: colId,
        columnEnd: colId
      });
    } else {
      gridOptions.api.clearRangeSelection();
      gridOptions.api.addCellRange({
        rowStartIndex: 0,
        rowEndIndex: gridOptions.api.getDisplayedRowCount() - 1,
        columnStart: colId,
        columnEnd: colId
      });
    }
  };

  setColumnHighlighting(event.ctrlKey);

  setRangeSelectionForColumn();

  // console.log(this.params.gridOptions.api.getEditingCells());
};

CustomHeader.prototype.onExpandButtonListener = function(event) {
  this.expandButton.style.display = 'none';
  this.compressButton.style.display = 'block';

  const columnDefs = this.params.context.gridOptions.columnDefs;
  columnDefs.forEach((columnDef) => {
    this.params.context.gridOptions.columnApi.setColumnVisible(columnDef.field, true);
  });
};

CustomHeader.prototype.onCompressButtonListener = async function(event) {
  try {
    this.expandButton.style.display = 'block';
    this.compressButton.style.display = 'none';

    const columns = this.params.context.gridOptions.columnDefs;

    for (let i = 0; i < columns.length; i++) {
      if (columns[i].hide === null) {
        columns[i].hide = false;
      }

      if (columns[i].hide === true) {
        this.params.context.gridOptions.columnApi.setColumnVisible(columns[i].field, false);
      } else {
        this.params.context.gridOptions.columnApi.setColumnVisible(columns[i].field, true);
      }
    }
  } catch (err) {
    return errorHandler({err: err, context: 'CustomHeader.prototype.onCompressButtonListener', isLast: true});
  }
};

CustomHeader.prototype.onMenuClick = function() {
  this.params.showColumnMenu(this.menuButton);
};

// cleanup
CustomHeader.prototype.destroy = function() {
  if (this.headerLabel !== undefined) {
    this.columnHeader.removeEventListener('click', this.onHeaderClickListener.bind(this));
  }

  if (this.params.column.colId === this.params.context.COSMETIC_ID) {
    this.expandButton.removeEventListener('click', this.onExpandButtonListener.bind(this));
    this.compressButton.removeEventListener('click', this.onCompressButtonListener.bind(this));
  }
};