import {updateData,
  changeFormulaBar,
  moveSelection,
  errorHandler,
  debugLog} from '../utility/utility';
import {undo} from './undo';
import {modifyRowData,
  processCellForDatabase,
  refresh,
  changeStyle,
  searchForCell,
  searchForColumn,
  setFilter,
  replaceCell} from './grid-functions';

/*
  Previously virtualRowIndex was used for when data was loaded in smaller
  chunks and refreshes put the user back in some arbitrary position which was
  not contiguous in indexes. Right now all implemenatations are just
  pulling in all records. This will likely need to be added back in if
  a situation deems using lazy loading necessary. In which case just
  uncomment the lines in this file and other files that use it, and then
  refactor findVirtualRowIndex to get a value that actually works.
*/
async function keyPressHandler(context, event) {
  try {
    const gridApi = context.gridOptions.api;
    const nonFormulaBarUpdatingElements = ['formula-bar', 'search-cell-text-box', 'search-column-text-box', 'filter-text-box', 'replace-cell-text-box'];

    const KEY_TAB = 9;
    const KEY_ENTER = 13;
    const KEY_END = 35;
    const KEY_HOME = 36;
    const KEY_LEFT = 37;
    const KEY_UP = 38;
    const KEY_RIGHT = 39;
    const KEY_DOWN = 40;
    const KEY_DEL = 46;
    const KEY_ZERO = 48;
    const KEY_C = 67;
    const KEY_D = 68;
    const KEY_F = 70;
    const KEY_S = 83;
    const KEY_V = 86;
    const KEY_Z = 90;
    const KEY_NUMPAD_ZERO = 96;
    const KEY_DIVIDE = 111;
    const KEY_F_FIVE = 116;
    const KEY_SEMICOLON = 186;
    const KEY_SINGLE_QUOTE = 222;

    // don't let the user hit keys when there is no focus (i.e. loading)
    if (gridApi.getFocusedCell() === null && (event.which !== KEY_ENTER || event.keyCode !== KEY_ENTER)) return;

    if (event.which === KEY_DEL || event.keyCode === KEY_DEL) {
      // if (document.activeElement.style.backgroundImage === 'url("/assets/images/background-out.jpg")') {
      //   gridApi.setFocusedCell(gridApi.getFocusedCell().rowIndex, gridApi.getFocusedCell().column.colId);
      // }

      const rangeSelections = gridApi.getCellRanges();

      const updateSets = [];
      let updates = [];

      const isNotOneSelection = rangeSelections.length !== 1;
      const isNotSingleRowSelection = rangeSelections[0].startRow.rowIndex !== rangeSelections[0].endRow.rowIndex;
      const isNotSingleColumnSelection = rangeSelections[0].columns.length > 1;
      const isNotSingleCellSelection = isNotOneSelection || isNotSingleRowSelection || isNotSingleColumnSelection;
      if (isNotSingleCellSelection) {
        // This redraw is to make valueEditor finish before we continue.
        gridApi.redrawRows();

        rangeSelections.forEach((rangeSelection) => {
          const startRowIndex = Math.min(rangeSelection.start.rowIndex, rangeSelection.end.rowIndex);
          const endRowIndex = Math.max(rangeSelection.start.rowIndex, rangeSelection.end.rowIndex);
          const startColumn = rangeSelections[0].columns[0].colId;

          const rowNodes = [];

          const virtualStartRowIndex = startRowIndex;
          const virtualEndRowIndex = endRowIndex;

          for (let rowIndex = virtualStartRowIndex; rowIndex <= virtualEndRowIndex; rowIndex++) {
            const row = gridApi.getDisplayedRowAtIndex(rowIndex);

            rangeSelection.columns.forEach((column) => {
              if (column.colId !== context.COSMETIC_ID && column.colId !== context.ID) {
                if (row.data[column.colId] !== '') {
                  const oldValue = row.data[column.colId];

                  row.data[column.colId] = '';
                  rowNodes.push(row);

                  if (updates.length >= 400) {
                    if (updateSets[updateSets.length - 1] !== updates) updateSets.push(updates);

                    updates = [];
                  }

                  updates.push({
                    id: row.data[context.ID],
                    colId: column.colId,
                    value: '',
                    oldValue: oldValue,
                    gridName: context.getGridName(),
                    altColumnTable: context.params.options.altColumnTable
                  });
                }
              }
            });
          }

          if (rowNodes.length > 0) {
            gridApi.redrawRows({rowNodes: rowNodes});
            gridApi.setFocusedCell(virtualStartRowIndex, startColumn);
            gridApi.ensureColumnVisible(startColumn);
          }
        });

        if (updates.length !== 0) {
          if (updateSets[updateSets.length - 1] !== updates) {
            updateSets.push(updates);
          }
        }

        if (updateSets.length !== 0) {
          await updateData(context, updateSets);
          debugLog('Updated Data');
          context.pushEvent(updateSets);
        }
      }
    } else if (event.which === KEY_F_FIVE || event.keyCode === KEY_F_FIVE) {
      event.preventDefault();
      await refresh(context);
    } else if (event.ctrlKey === true &&
              (event.which === KEY_Z || event.keyCode === KEY_Z)) {
      event.preventDefault();
      undo(context);
    } else if (event.ctrlKey === true &&
              (event.which === KEY_D || event.keyCode === KEY_D)) {
      event.stopPropagation();
      event.preventDefault();

      const rangeSelections = gridApi.getCellRanges();

      if (rangeSelections[0].startRow.rowIndex !== 0 && rangeSelections[0].startRow.rowIndex === rangeSelections[0].endRow.rowIndex) {
        // const virtualRowIndex = findVirtualRowIndex(context, rangeSelections[0].start.rowIndex);
        const copyRow = gridApi.getDisplayedRowAtIndex(rangeSelections[0].startRow.rowIndex - 1);
        const pasteRow = gridApi.getDisplayedRowAtIndex(rangeSelections[0].startRow.rowIndex);

        for (let i = 0; i < rangeSelections[0].columns.length; i++) {
          const key = rangeSelections[0].columns[i].colId;
          const oldValue = pasteRow.data[key];
          const newValue = copyRow.data[key];

          modifyRowData(context, rangeSelections[0].startRow.rowIndex, key, newValue);
          await processCellForDatabase(context, rangeSelections[0].startRow.rowIndex, key, oldValue, newValue);
        }
      }
    } else if (event.ctrlKey === true && event.shiftKey === true &&
              (event.which === KEY_F || event.keyCode === KEY_F)) {
      event.stopPropagation();
      event.preventDefault();
      document.getElementById('filter-text-box').focus();
    } else if (event.ctrlKey === true && event.shiftKey === true &&
              (event.which === KEY_S || event.keyCode === KEY_S)) {
      event.stopPropagation();
      event.preventDefault();
      changeStyle(context, 'color', 'bg');
    } else if (event.ctrlKey === true &&
              (event.which === KEY_F || event.keyCode === KEY_F)) {
      event.stopPropagation();
      event.preventDefault();
      document.getElementById('search-cell-text-box').focus();
    } else if (((event.which >= KEY_ZERO && event.which <= KEY_Z) ||
                (event.which >= KEY_NUMPAD_ZERO && event.which <= KEY_DIVIDE) ||
                (event.which >= KEY_SEMICOLON && event.which <= KEY_SINGLE_QUOTE)) ||
               ((event.keyCode >= KEY_ZERO && event.keyCode <= KEY_Z) ||
                (event.keyCode >= KEY_NUMPAD_ZERO && event.keyCode <= KEY_DIVIDE) ||
                (event.keyCode >= KEY_SEMICOLON && event.keyCode <= KEY_SINGLE_QUOTE))) {
      if (document.activeElement.style.backgroundImage === 'url("/assets/images/background-out.jpg")') {
        gridApi.setFocusedCell(gridApi.getFocusedCell().rowIndex, gridApi.getFocusedCell().column.colId);
      }

      if (!nonFormulaBarUpdatingElements.includes(document.activeElement.id)) {
        changeFormulaBar(context, event.key, true);
      }
    } else if (event.which === KEY_HOME || event.keyCode === KEY_HOME || event.which === KEY_END || event.keyCode === KEY_END) {
      event.stopPropagation();
      event.preventDefault();

      const columnDefs = context.gridOptions.columnDefs.slice();
      if (event.which === KEY_END || event.keyCode === KEY_END) {
        columnDefs.reverse();
      }

      const focusedCell = gridApi.getFocusedCell();

      if (focusedCell !== null) {
        const firstVisibleNonPinnedColumn = columnDefs.find((columnDef) =>
          columnDef.field !== context.COSMETIC_ID && columnDef.field !== context.ID && context.gridOptions.columnApi.getColumn(columnDef.field).visible);

        moveSelection(context, focusedCell.rowIndex, firstVisibleNonPinnedColumn.field);
      }

      return true;
    } else if (event.which === KEY_ENTER || event.keyCode === KEY_ENTER) {
      event.stopPropagation();
      event.preventDefault();

      // if (document.activeElement.style.backgroundImage === 'url("/assets/images/background-out.jpg")') {
      //   gridApi.setFocusedCell(gridApi.getFocusedCell().rowIndex, gridApi.getFocusedCell().column.colId);
      //   moveSelection(gridApi.getFocusedCell().rowIndex + 1, gridApi.getFocusedCell().column.colId);
      // }

      if (document.activeElement.id === 'search-cell-text-box') {
        searchForCell(context);
        document.getElementById('search-cell-text-box').focus();
      } else if (document.activeElement.id === 'search-column-text-box') {
        searchForColumn(context);
        document.getElementById('search-column-text-box').focus();
      } else if (document.activeElement.id === 'filter-text-box') {
        setFilter(context);
        document.getElementById('filter-text-box').focus();
      } else if (document.activeElement.id === 'replace-cell-text-box') {
        replaceCell(context);
        document.getElementById('replace-cell-text-box').focus();
      } else {
        const focusedCell = gridApi.getFocusedCell();
        const currentRow = gridApi.getDisplayedRowAtIndex(focusedCell.rowIndex);
        const nextRow = gridApi.getDisplayedRowAtIndex(focusedCell.rowIndex + 1);
        const finalRow = nextRow !== null ? nextRow : currentRow;
        const currentColumn = focusedCell.column;

        let nextColumn = currentColumn.colId;

        moveSelection(context, finalRow.rowIndex, nextColumn);

        return true;
      }
    } else if ((event.shiftKey === true && event.which === KEY_TAB) || (event.shiftKey === true && event.keyCode === KEY_TAB)) {
      event.stopPropagation();
      event.preventDefault();

      // if (document.activeElement.style.backgroundImage === 'url("/assets/images/background-out.jpg")') {
      //   gridApi.setFocusedCell(gridApi.getFocusedCell().rowIndex, gridApi.getFocusedCell().column.colId);
      //   moveSelection(context, gridApi.getFocusedCell().rowIndex, gridApi.getFocusedCell().column.colId);
      // }

      const focusedCell = gridApi.getFocusedCell();

      if (focusedCell !== null) {
        let nextRowIndex = focusedCell.rowIndex;

        const columns = context.gridOptions.columnDefs;
        let previousColumn = focusedCell.column;
        let nextColumn;

        do {
          for (let i = 0; i < columns.length; i++) {
            if (columns[i].field === previousColumn.colId || previousColumn.colId === 'ag-Grid-AutoColumn') {
              if (columns[i - 1] !== undefined && columns[i - 1].field !== context.COSMETIC_ID && columns[i - 1].field !== context.ID) {
                nextColumn = context.gridOptions.columnApi.getColumn(columns[i - 1].field);
              } else {
                nextColumn = context.gridOptions.columnApi.getColumn(columns[columns.length - 1].field);
                nextRowIndex--;
              }
              break;
            }
          }

          previousColumn = nextColumn;
        } while (nextColumn.colId === context.COSMETIC_ID || nextColumn.colId === context.ID || nextColumn.visible === false);

        const renderedRowCount = gridApi.getModel().getRowCount();

        if (nextRowIndex < 0) {
          nextRowIndex = renderedRowCount + 1;
        }

        gridApi.stopEditing();
        moveSelection(context, nextRowIndex, nextColumn.colId);
      }

      return true;
    } else if (event.which === KEY_TAB || event.keyCode === KEY_TAB) {
      event.stopPropagation();
      event.preventDefault();

      // if (document.activeElement.style.backgroundImage === 'url("/assets/images/background-out.jpg")') {
      //   gridApi.setFocusedCell(gridApi.getFocusedCell().rowIndex, gridApi.getFocusedCell().column.colId);
      //   moveSelection(context, gridApi.getFocusedCell().rowIndex, gridApi.getFocusedCell().column.colId);
      // }

      const focusedCell = gridApi.getFocusedCell();

      if (focusedCell !== null) {
        let nextRowIndex = focusedCell.rowIndex;

        const columns = context.gridOptions.columnDefs;
        let previousColumn = focusedCell.column;
        let nextColumn;

        do {
          for (let i = 0; i < columns.length; i++) {
            if (columns[i].field === previousColumn.colId || previousColumn.colId === 'ag-Grid-AutoColumn') {
              if (columns[i + 1] !== undefined && columns[i + 1].field !== context.COSMETIC_ID && columns[i + 1].field !== context.ID) {
                nextColumn = context.gridOptions.columnApi.getColumn(columns[i + 1].field);
              } else {
                nextColumn = context.gridOptions.columnApi.getColumn(columns[0].field);
                nextRowIndex++;
              }
              break;
            }
          }

          previousColumn = nextColumn;
        } while (nextColumn.colId === context.COSMETIC_ID || nextColumn.colId === context.ID || nextColumn.visible === false);

        const renderedRowCount = gridApi.getModel().getRowCount();

        if (nextRowIndex >= renderedRowCount) {
          nextRowIndex = renderedRowCount - 1;
        }

        gridApi.stopEditing();
        moveSelection(context, nextRowIndex, nextColumn.colId);
      }

      return true;
    } else if (event.which === KEY_LEFT || event.keyCode === KEY_LEFT ||
      event.which === KEY_UP || event.keyCode === KEY_UP ||
      event.which === KEY_RIGHT || event.keyCode === KEY_RIGHT ||
      event.which === KEY_DOWN || event.keyCode === KEY_DOWN) {
      if (!nonFormulaBarUpdatingElements.includes(document.activeElement.id)) {
        if (!context.getClickedEdit()) {
          event.stopPropagation();
          event.preventDefault();

          const columns = context.gridOptions.columnApi.getAllGridColumns();
          const focusedCell = gridApi.getFocusedCell();
          const row = gridApi.getDisplayedRowAtIndex(focusedCell.rowIndex);

          let nextRowIndex;
          let nextColumn;

          if (event.which === KEY_LEFT || event.keyCode === KEY_LEFT) {
            nextRowIndex = focusedCell.rowIndex;

            let currentColumnIndex = columns.findIndex((column) => column.colId === focusedCell.column.colId);

            if (currentColumnIndex !== -1) {
              if (currentColumnIndex - 1 < 1) {
                currentColumnIndex = 2;
              }

              for (let i = currentColumnIndex - 1; i >= 0; i--) {
                if (columns[i].colId !== context.COSMETIC_ID &&
                    columns[i].colId !== context.ID &&
                    columns[i].visible === true) {
                  if (event.ctrlKey !== true) {
                    nextColumn = columns[i].colId;
                    break;
                  } else {
                    if (row.data[columns[i].colId] !== '') {
                      nextColumn = columns[i].colId;
                      break;
                    }
                  }
                }
              }

              if (nextColumn === undefined) nextColumn = focusedCell.column.colId;
            } else {
              throw `couldn't find currentColumn`;
            }
          } else if (event.which === KEY_UP || event.keyCode === KEY_UP) {
            if (event.ctrlKey !== true) {
              nextRowIndex = focusedCell.rowIndex - 1 < 0 ? 0 : focusedCell.rowIndex - 1;
            } else {
              for (let i = focusedCell.rowIndex - 1; i >= 0; i--) {
                const currRow = gridApi.getDisplayedRowAtIndex(i);
                if (currRow.data[focusedCell.column.colId] !== '') {
                  nextRowIndex = i;
                  break;
                }
              }
            }

            if (nextRowIndex === undefined) nextRowIndex = focusedCell.rowIndex;

            nextColumn = focusedCell.column.colId;
          } else if (event.which === KEY_RIGHT || event.keyCode === KEY_RIGHT) {
            nextRowIndex = focusedCell.rowIndex;

            let currentColumnIndex = columns.findIndex((column) => column.colId === focusedCell.column.colId);

            if (currentColumnIndex !== -1) {
              if (currentColumnIndex === columns.length - 1) {
                currentColumnIndex = columns.length - 2;
              }

              for (let i = currentColumnIndex + 1; i <= columns.length - 1; i++) {
                if (columns[i] !== undefined &&
                    columns[i].colId !== context.COSMETIC_ID &&
                    columns[i].colId !== context.ID &&
                    columns[i].visible === true) {
                  if (event.ctrlKey !== true) {
                    nextColumn = columns[i].colId;
                    break;
                  } else {
                    if (row.data[columns[i].colId] !== '') {
                      nextColumn = columns[i].colId;
                      break;
                    }
                  }
                }
              }

              if (nextColumn === undefined) nextColumn = focusedCell.column.colId;
            } else {
              throw `couldn't find currentColumn`;
            }

            if (nextColumn === undefined) {
              nextColumn = columns[columns.length.colId];
            }
          } else if (event.which === KEY_DOWN || event.keyCode === KEY_DOWN) {
            const renderedRowCount = gridApi.getModel().getRowCount();

            if (event.ctrlKey !== true) {
              nextRowIndex = focusedCell.rowIndex + 1 >= renderedRowCount ? focusedCell.rowIndex : focusedCell.rowIndex + 1;
            } else {
              for (let i = focusedCell.rowIndex + 1; i < renderedRowCount; i++) {
                const currRow = gridApi.getDisplayedRowAtIndex(i);
                if (currRow.data[focusedCell.column.colId] !== '') {
                  nextRowIndex = i;
                  break;
                }
              }
            }

            if (nextRowIndex === undefined) nextRowIndex = focusedCell;

            nextColumn = focusedCell.column.colId;
          }

          gridApi.stopEditing();
          moveSelection(context, nextRowIndex, nextColumn);
        }
      }
    }

    return;
  } catch (err) {
    return errorHandler({err: err, context: 'keyPressHandler', isLast: true});
  }
}

export {
  keyPressHandler
};