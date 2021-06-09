import {updateData,
  changeFormulaBar,
  errorHandler,
  debugLog,
  isSingleCellSelection} from '../utility/utility';

export function valueEditor() {
}

// gets called once before the renderer is used
valueEditor.prototype.init = function(params) {
  try {
    this.params = params;

    const gridOptions = params.api.gridOptionsWrapper.gridOptions;

    this.columnHeader = document.getElementById('column-header-container-' + params.column.colId);
    /*
      this.columnHeader.setAttribute('isediting', 'true');
      //console.log(this.columnHeader);
      this.columnHeader.addEventListener('click', this.onClickListener.bind(this));
    */

    // create the cell input
    this.input = document.createElement('input');
    this.input.setAttribute('style', 'width: 100%; height: 100%;');
    this.input.id = 'current-input';
    this.input.addEventListener('click', this.onClickInputListener.bind(this));

    const DELETE_KEY = 46;
    const BKSPC_KEY = 8;

    // if user presses bkspace, delete or a character key when entering edit mode
    // then erase contents. Anything but delete will still enter edit mode, just
    // with a blank or new value. Otherwise, just show current value.
    if (params.keyPress === DELETE_KEY) {
      const rowIndex = params.rowIndex;
      const id = params.node.id;
      const column = params.column;
      const oldValue = this.params.value;
      const rangeSelections = gridOptions.api.getCellRanges();

      if (isSingleCellSelection(rangeSelections)) {
        if (oldValue !== '') {
          this.input.value = '';
          changeFormulaBar(params.context, '');

          const updateSets = [];
          const update = [];

          const context = params.context;

          update.push({
            id: id,
            colId: params.column.colId,
            value: '',
            oldValue: oldValue,
            gridName: context.getGridName(),
            altColumnTable: context.params.options.altColumnTable
          });
          updateSets.push(update);

          const rowNode = params.node;
          const updated = Object.assign({}, rowNode.data);
          updated[params.column.colId] = '';

          rowNode.setData(updated);

          const rowNodes = [];
          rowNodes.push(rowNode);

          gridOptions.api.redrawRows({rowNodes: rowNodes});
          params.api.stopEditing(false);
          gridOptions.api.setFocusedCell(rowIndex, column);
          gridOptions.api.ensureColumnVisible(column);

          // this is a .then instead of await so the init function isn't async
          // and thus properly returns what it needs to ag-grid.
          updateData(context, updateSets).then(() => {
            debugLog('Updated Data');
            params.context.pushEvent(updateSets);
          }).catch((err) => {
            return errorHandler({err: err, context: 'updateData.then() in valueEditor', isLast: true});
          });
        } else {
          params.api.stopEditing(false);
          gridOptions.api.setFocusedCell(rowIndex, column);
          gridOptions.api.ensureColumnVisible(column);
        }
      } else {
        this.input.value = params.value;
        changeFormulaBar(params.context, params.value);
      }
    } else if (params.charPress) {
      this.input.value = params.charPress;
      changeFormulaBar(params.context, params.charPress);
    } else if (params.keyPress === BKSPC_KEY) {
      this.input.value = '';
      changeFormulaBar(params.context, '');
    } else {
      if (params.value !== undefined && params.value !== null) {
        this.input.value = params.value;
        changeFormulaBar(params.context, params.value);
      }
    }
  } catch (err) {
    return errorHandler({err: err, context: 'valueEditor.prototype.init', isLast: true});
  }
};

// gets called once when grid ready to insert the element
valueEditor.prototype.getGui = function() {
  return this.input;
};

// focus and select can be done after the gui is attached
valueEditor.prototype.afterGuiAttached = function() {
  this.input.focus();
};

// returns the new value after editing
valueEditor.prototype.getValue = function() {
  /*
    this.columnHeader.setAttribute('isediting', 'false');
    this.columnHeader.removeEventListener('click', this.onClickListener.bind(this));*/
  /* TODO: this is a shotty implementation and probably needs to be refactored. */
  setTimeout(() => {
    this.params.api.redrawRows();
  }, 10);
  return this.input.value;
};

valueEditor.prototype.onClickInputListener = function() {
  this.params.context.setClickedEdit(true);
};

valueEditor.prototype.destroy = function() {
  if (this.input !== undefined) {
    this.params.context.setClickedEdit(false);
    this.input.removeEventListener('click', this.onClickInputListener.bind(this));
  }
};