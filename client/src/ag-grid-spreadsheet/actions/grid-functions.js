import {gridOptionsDynamicConfig} from '../setup/grid-options-dynamic-config';
import {getRowNodeFromTextNode,
  updateStyle,
  getRowData,
  isSingleCellSelection,
  extractStyles,
  waitForLoadingFinish,
  loading,
  errorHandler,
  startSnackbar,
  quickSnackbar,
  debugLog} from '../utility/utility';

async function setFilter(context) {
  context.filterPattern = document.getElementById('filter-text-box').value;

  // This scrolls the ui back to the top. If you don't do this it crashes
  // the browser tab since you're scrolled to a row that doesn't exist.
  context.gridOptions.api.ensureIndexVisible(0, top);
  context.resetExpandedGroups();
  await refresh(context, false, false);
}

function searchForCell(context) {
  const columnDefs = context.gridOptions.columnDefs;
  const searchCellPattern = document.getElementById('search-cell-text-box').value;
  const focusedCell = context.gridOptions.api.getFocusedCell();
  const displayedRowCount = context.gridOptions.api.getDisplayedRowCount();

  let focusedIndex;
  let focusedColumn;

  context.gridOptions.api.clearRangeSelection();

  if (focusedCell !== null) {
    focusedIndex = focusedCell.rowIndex;

    const focusedColumnName = focusedCell.column.colId;

    for (let i = 0; i < columnDefs.length; i++) {
      if (columnDefs[i].field === focusedColumnName) {
        if (i < columnDefs.length - 1) {
          focusedColumn = i + 1;
        } else {
          focusedColumn = 0;
          if (focusedIndex >= displayedRowCount - 1) {
            focusedIndex = 0;
          }
        }

        break;
      }
    }
  } else {
    focusedIndex = 0;
    focusedColumn = 0;
  }

  if (searchCellPattern === '') {
    context.gridOptions.api.ensureIndexVisible(0, 'middle');
  } else {
    let broke = false;
    let re = new RegExp(searchCellPattern.toLowerCase());

    for (let i = focusedIndex; i < displayedRowCount; i++) {
      const row = context.gridOptions.api.getDisplayedRowAtIndex(i);

      for (let j = focusedColumn; j < columnDefs.length; j++) {
        const key = columnDefs[j].field;

        if (key !== context.COSMETIC_ID && key !== context.ID && key !== 'ag-Grid-AutoColumn' && !/(styleattrib_|expvalue_)/.test(key)) {
          const col = context.gridOptions.columnApi.getColumn(key);

          if (col !== null) {
            if (row.data !== undefined && row.data[key] !== null && col.visible === true) {
              if (row.data[key] && re.test(row.data[key].toLowerCase())) {
                context.gridOptions.api.ensureIndexVisible(i, 'middle');
                context.gridOptions.api.ensureColumnVisible(key);
                context.gridOptions.api.setFocusedCell(i, key, null);

                broke = true;
                break;
              }
            }
          }
        }

        if (j >= columnDefs.length - 1) {
          focusedColumn = 0;
        }
      }

      if (broke) {
        break;
      }

      if (i >= displayedRowCount - 1) {
        // start looking again back at 0;
        focusedIndex = 0;
        focusedColumn = 0;

        broke = false;
        re = new RegExp(searchCellPattern.toLowerCase());

        for (let k = focusedIndex; k < displayedRowCount; k++) {
          const row = context.gridOptions.api.getDisplayedRowAtIndex(k);

          for (let l = focusedColumn; l < columnDefs.length; l++) {
            const key = columnDefs[l].field;

            if (key !== context.COSMETIC_ID && key !== context.ID && key !== 'ag-Grid-AutoColumn' && !/(styleattrib_|expvalue_)/.test(key)) {
              const col = context.gridOptions.columnApi.getColumn(key);

              if (col !== null) {
                if (row.data[key] !== null && col.visible === true) {
                  if (row.data[key] && re.test(row.data[key].toLowerCase())) {
                    context.gridOptions.api.ensureIndexVisible(k, 'middle');
                    context.gridOptions.api.ensureColumnVisible(key);
                    context.gridOptions.api.setFocusedCell(k, key, null);

                    broke = true;
                    break;
                  }
                }
              }
            }

            if (l >= columnDefs.length - 1) {
              focusedColumn = 0;
            }
          }

          if (broke) {
            break;
          }

          if (k >= displayedRowCount - 1) {
            debugLog(searchCellPattern + ' is not in grid');
            break;
          }
        }
      }
    }
  }
}

function replaceCell(context) {
  const focusedCell = context.gridOptions.api.getFocusedCell();
  // const index = findVirtualRowIndex(context, focusedCell.rowIndex);
  const index = focusedCell.rowIndex;
  const column = focusedCell.column.colId;

  const rowData = getRowData(context.gridOptions);
  const nodeId = rowData[index][context.ID];

  if (focusedCell !== null) {
    const replacementText = document.getElementById('replace-cell-text-box').value;
    const rowNode = context.gridOptions.api.getRowNode(nodeId);

    rowNode.setDataValue(column, replacementText);

    context.gridOptions.api.setFocusedCell(index, column, null);
    context.gridOptions.api.ensureColumnVisible(column);
  }
}

function searchForColumn(context) {
  if (document.getElementById('search-column-text-box').value !== context.searchColumnPattern) {
    context.searchColumnPattern = document.getElementById('search-column-text-box').value;
    context.lastSearchColumn = null;
  }

  if (context.searchColumnPattern === '') {
    for (let i = 0; i < context.gridOptions.columnDefs.length; i++) {
      const column = context.gridOptions.columnApi.getColumn(context.gridOptions.columnDefs[i].field);

      if (column !== null && (column.pinned === '' || column.pinned === null) && column.visible) {
        context.gridOptions.api.ensureColumnVisible(column.colId);
        context.lastSearchColumn = column.colId;
        break;
      }

      if (i >= context.gridOptions.columnDefs.length - 1) {
        debugLog('There is no column that is not pinned and visible.');
      }
    }
  } else {
    const columns = context.gridOptions.columnApi.getAllGridColumns();
    let lastSearchColumnIndex = -1;

    if (context.lastSearchColumn !== null) {
      lastSearchColumnIndex = columns.findIndex((col) => context.lastSearchColumn === col.colId);

      if (lastSearchColumnIndex === -1) {
        debugLog('Could not find lastSearchColumnIndex for: ' + context.lastSearchColumn);
      }
    }

    for (let i = lastSearchColumnIndex + 1; i < columns.length; i++) {
      const col = columns[i];

      if (col.colId !== context.COSMETIC_ID && col.colId !== context.ID && !/styleattrib_/.test(col.colId) && !/expvalue_/.test(col.colId)) {
        const replaceCharactersInPattern = () => {
          let replacedPattern = context.searchColumnPattern.replace(/[ \/'\.,\[\]!@#\$%&\*\{\}\|\\":;\?><\+-=~`\(\)]/g, '_');
          const regex = new RegExp('^\\d');
          replacedPattern = replacedPattern.replace(regex, '_' + replacedPattern.charAt(0));
          replacedPattern = replacedPattern.replace(/0/g, 'zero');
          replacedPattern = replacedPattern.replace(/1/g, 'one');
          replacedPattern = replacedPattern.replace(/2/g, 'two');
          replacedPattern = replacedPattern.replace(/3/g, 'three');
          replacedPattern = replacedPattern.replace(/4/g, 'four');
          replacedPattern = replacedPattern.replace(/5/g, 'five');
          replacedPattern = replacedPattern.replace(/6/g, 'six');
          replacedPattern = replacedPattern.replace(/7/g, 'seven');
          replacedPattern = replacedPattern.replace(/8/g, 'eight');
          replacedPattern = replacedPattern.replace(/9/g, 'nine');
          replacedPattern = replacedPattern.toLowerCase();
          replacedPattern = replacedPattern.substring(0, 51);

          return replacedPattern;
        };

        const replacedPattern = replaceCharactersInPattern();

        const re = new RegExp(replacedPattern);

        if (col.colId !== null) {
          if (re.test(col.colId)) {
            const column = context.gridOptions.columnApi.getColumn(col.colId);
            if (column !== null && (column.pinned === '' || column.pinned === null) && column.visible) {
              context.gridOptions.api.ensureColumnVisible(col.colId);
              // setFocusedCell relative to current row selection.
              context.lastSearchColumn = col.colId;
              break;
            }
          }
        }
      }

      if (i >= columns.length - 1) {
        context.lastSearchColumn = context.gridOptions.columnApi.getColumn(context.gridOptions.columnDefs[0].field);

        for (let j = 0; j < columns.length; j++) {
          const col = columns[j];

          if (col.colId !== context.COSMETIC_ID && col.colId !== context.ID && !/styleattrib_/.test(col.colId)) {
            const re = new RegExp(context.searchColumnPattern.toLowerCase());

            if (col.colId !== null) {
              if (re.test(col.colId)) {
                const column = context.gridOptions.columnApi.getColumn(col.colId);
                if (column !== null && (column.pinned === '' || column.pinned === null) && column.visible) {
                  context.gridOptions.api.ensureColumnVisible(col.colId);
                  // setFocusedCell relative to current row selection.
                  context.lastSearchColumn = col.colId;
                  break;
                }
              }
            }
          }

          if (j >= columns.length - 1) {
            context.lastSearchColumn = context.gridOptions.columnApi.getColumn(context.gridOptions.columnDefs[0].field);
            debugLog('There is no column that matches: ' + context.searchColumnPattern);
            break;
          }
        }
      }
    }
  }
}

async function toggleLoadAll(context) {
  try {
    if (context.gridOptions.cacheBlockSize === 200) {
      context.gridOptions.cacheBlockSize = 10000;
      document.getElementById('load-img').classList.add('vertical-flip');
    } else {
      context.gridOptions.cacheBlockSize = 200;
      document.getElementById('load-img').classList.remove('vertical-flip');
    }

    await refresh(context);
  } catch (err) {
    return errorHandler({err: err, context: 'toggleLoadAll', isLast: true});
  }
}

async function toggleGetAll(context) {
  try {
    if (context.params.options.rowGroup === context.rowGroup) {
      context.params.options.rowGroup = context.combinedRowGroup;
      context.params.options.rowGroupFilter = undefined;
      document.getElementById('load-img').classList.add('vertical-flip');
    } else {
      context.params.options.rowGroup = context.rowGroup;
      context.params.options.rowGroupFilter = context.rowGroupFilter;
      document.getElementById('load-img').classList.remove('vertical-flip');
    }

    await refresh(context);
  } catch (err) {
    return errorHandler({err: err, context: 'toggleGetAll', isLast: true});
  }
}

async function refresh(context, reselect=true, reopenGroups=true) {
  try {
    let focusedCell = context.gridOptions.api.getFocusedCell();

    // This is so when the grid is refreshed we can ensureIndexVisible on this row.
    // This is -10 since the grid loads in 10 more lines of data than we can see.
    context.lastDisplayedRow = context.gridOptions.api.getLastDisplayedRow() - 10;

    await gridOptionsDynamicConfig(context);

    context.gridOptions.api.setColumnDefs(context.gridOptions.columnDefs);
    context.gridOptions.api.refreshServerSideStore();

    await loading(context, true, 'Loading...');
    await waitForLoadingFinish(context);

    if (reopenGroups && context.params.options.rowGroup) {
      await loading(context, true, 'Reopening groups to get you back to where you were...');

      const columnDefs = context.gridOptions.columnDefs;

      const groupNames = [];
      columnDefs.forEach((def) => {
        if (def.rowGroup) {
          groupNames.push(def.field);
        }
      });

      const expandedGroups = context.getExpandedGroupsAndCullHiddenSecondaryGroupings(context.params.options.rowGroup.length);
      for (let i = 0; i < expandedGroups.length; i++) {
        const group = expandedGroups[i];
        const groupNode = context.getGroupNode(group);
        let groupNodeId;
        let rowNode;

        if (groupNode) {
          if (groupNode.data[context.COSMETIC_ID]) {
            groupNodeId = groupNode.data[context.ID];
            rowNode = context.gridOptions.api.getRowNode(groupNodeId);
          } else {
            groupNodeId = groupNode.data.agGridTextNodeId;
            rowNode = getRowNodeFromTextNode(context, groupNodeId);
          }
          context.gridOptions.api.ensureIndexVisible(rowNode.rowIndex, 'middle');
          rowNode.setExpanded(true);

          context.setLoading(true);
          await waitForLoadingFinish(context);
        } else {
          console.log(`Some groups that were opened don't exist anymore. Quitting...`);
          focusedCell = undefined;
          break;
        }
      }
    }

    console.log(`7`);

    if (reselect && focusedCell) {
      // const rowIndex = findVirtualRowIndex(context, focusedCell.rowIndex);
      const rowIndex = focusedCell.rowIndex;

      context.gridOptions.api.clearRangeSelection();
      context.gridOptions.api.addCellRange({
        rowStartIndex: rowIndex,
        rowEndIndex: rowIndex,
        columnStart: focusedCell.column.colId,
        columnEnd: focusedCell.column.colId
      });

      context.gridOptions.api.setFocusedCell(rowIndex, focusedCell.column.colId, focusedCell.floating);

      if (context.params.options.rowGroup) {
        context.gridOptions.api.ensureIndexVisible(rowIndex, 'middle');
      } else {
        if (context.lastDisplayedRow > 0) {
          context.gridOptions.api.ensureIndexVisible(context.lastDisplayedRow, 'bottom');
          context.lastDisplayedRow = 0;
        }
      }
    }

    console.log(`8`);

    await loading(context, false);
  } catch (err) {
    return errorHandler({err: err, context: 'refresh', isLast: true});
  }
}

async function changeStyle(context, styleToAlter, param, altIndex) {
  try {
    await startSnackbar('Updating style(s)...\nPlease wait.');

    const findAddOrRemove = () => {
      /* Add unless all cells already have the property */
      let add = false;

      const toFind = styleToAlter === 'border' ? '\\$bdr' : '\\$bld';

      const re = new RegExp(toFind);

      for (let i = 0; i < rangeSelections.length; i++) {
        const range = rangeSelections[i];

        // get absolute start and end row since selection could have happened
        // upwards or downwards
        const startRowIndex = Math.min(range.start.rowIndex, range.end.rowIndex);
        const endRowIndex = Math.max(range.start.rowIndex, range.end.rowIndex);

        // const virtualStartRowIndex = findVirtualRowIndex(context, startRowIndex);
        // const virtualEndRowIndex = findVirtualRowIndex(context, endRowIndex);
        const virtualStartRowIndex = startRowIndex;
        const virtualEndRowIndex = endRowIndex;

        // for each cell in the selection, replace or append the designated style
        for (let rowIndex = virtualStartRowIndex; rowIndex <= virtualEndRowIndex; rowIndex++) {
          range.columns.forEach((column) => {
            if (typeof(rowData[rowIndex]['styleattrib_' + column.colId]) === 'string' && !re.test(rowData[rowIndex]['styleattrib_' + column.colId])) {
              add = true;
            }
          });
        }
      }

      return add;
    };

    const generateNewStyle = (cellStyle) => {
      let newStyle = '';

      if (styleToAlter === 'color') {
        const elementId = param + '-color-picker' + (altIndex ? `-${altIndex}` : '');
        const color = document.getElementById(elementId).value + param;

        if (cellStyle !== null) {
          const regex = new RegExp('#[\\w]+' + param);

          if (regex.test(cellStyle)) {
            newStyle = cellStyle.replace(regex, color);
          } else {
            newStyle = cellStyle + color;
          }
        } else {
          newStyle = color;
        }
      } else if (styleToAlter === 'border' || styleToAlter === 'bold') {
        const toFind = styleToAlter === 'border' ? '$bdr' : '$bld';
        const re = new RegExp('\\' + toFind);

        if (toAdd) {
          if (cellStyle !== '') {
            if (!re.test(cellStyle)) {
              newStyle = cellStyle + toFind;
            } else {
              newStyle = cellStyle;
            }
          } else {
            newStyle = toFind;
          }
        }

        if (!toAdd) {
          if (cellStyle !== '') {
            newStyle = cellStyle.replace(re, '');
          } else {
            newStyle = '';
          }
        }
      } else if (styleToAlter === 'decimal') {
        const styles = extractStyles(cellStyle);
        let hasFloat = false;
        let newFloat;

        for (let i = 0; i < styles.length; i++) {
          let format = styles[i];
          let formatParam;

          // find format and format params within style. Broken up by |
          const pos = styles[i].search(/\|/);
          if (pos !== -1) {
            format = styles[i].slice(0, pos);
            formatParam = styles[i].slice(pos + 1, styles[i].length);
          }

          if (format === 'fl') {
            hasFloat = true;
            if (param === '+') {
              // toFixed(), which is used to set the formatting, is only
              // valid for values 0-20 in some browsers.
              if (formatParam < 20) {
                newFloat = '$' + format + '|' + (parseInt(formatParam) + 1);
              } else {
                newFloat = '$' + format + '|' + formatParam;
              }
            } else {
              if (formatParam > 0) {
                newFloat = '$' + format + '|' + (parseInt(formatParam) - 1);
              } else {
                newFloat = '$' + format + '|' + formatParam;
              }
            }
          }
        }

        // if there wasn't a float in styles
        if (!hasFloat) {
          if (param === '+') {
            newFloat = '$fl|1';
          } else {
            newFloat = '$fl|0';
          }
        }

        newStyle = cellStyle;

        if (/\$fl\|[\w]+/.test(cellStyle)) {
          newStyle = cellStyle.replace(/\$fl\|[\w]+/, newFloat);
        } else {
          newStyle = cellStyle + newFloat;
        }
      }

      if (newStyle === null) {
        newStyle = '';
      }

      return newStyle;
    };

    const gridOptions = context.gridOptions;
    const rangeSelections = gridOptions.api.getCellRanges();
    const rowData = getRowData(gridOptions);

    const rowNodes = [];

    let updates = [];
    const updateSets = [];

    if (!rangeSelections) return;

    let toAdd = false;

    if (styleToAlter === 'border' || styleToAlter === 'bold') {
      toAdd = findAddOrRemove();
    }

    for (let i = 0; i < rangeSelections.length; i++) {
      const range = rangeSelections[i];

      // get absolute start and end row since selection could have happened
      // upwards or downwards
      const startRowIndex = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
      const endRowIndex = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);

      // const virtualStartRowIndex = findVirtualRowIndex(context, startRowIndex);
      // const virtualEndRowIndex = findVirtualRowIndex(context, endRowIndex);
      const virtualStartRowIndex = startRowIndex;
      const virtualEndRowIndex = endRowIndex;

      // for each cell in the selection, replace or append the designated style
      for (let rowIndex = virtualStartRowIndex; rowIndex <= virtualEndRowIndex; rowIndex++) {
        range.columns.forEach((column) => {
          if (column.colId !== context.COSMETIC_ID && column.colId !== context.ID) {
            const styleColumn = 'styleattrib_' + column.colId;

            let cellStyle = rowData[rowIndex][styleColumn];
            const oldStyle = cellStyle;

            // TODO: make it so null is '' before this point.
            if (cellStyle === null) {
              cellStyle = '';
            }

            const newStyle = generateNewStyle(cellStyle);

            const rowNode = gridOptions.api.getRowNode(rowData[rowIndex][context.ID]);
            const updated = Object.assign({}, rowNode.data);

            updated['styleattrib_' + column.colId] = newStyle;

            rowNode.setData(updated);

            rowNodes.push(rowNode);

            if (updates.length >= 400) {
              updateSets.push(updates);
              updates = [];
              updates.push({
                id: rowData[rowIndex][context.ID],
                colId: 'styleattrib_' + column.colId,
                value: newStyle,
                oldValue: oldStyle,
                gridName: context.getGridName(),
                altColumnTable: context.params.options.altColumnTable
              });
            } else {
              updates.push({
                id: rowData[rowIndex][context.ID],
                colId: 'styleattrib_' + column.colId,
                value: newStyle,
                oldValue: oldStyle,
                gridName: context.getGridName(),
                altColumnTable: context.params.options.altColumnTable
              });
            }
          }
        });
      }
    }

    if (updates.length !== 0) {
      updateSets.push(updates);
    }

    gridOptions.api.redrawRows({rowNodes: rowNodes});
    gridOptions.api.setFocusedCell(Math.min(rangeSelections[0].startRow.rowIndex, rangeSelections[0].endRow.rowIndex), rangeSelections[0].columns[0].colId);
    gridOptions.api.ensureColumnVisible(rangeSelections[0].columns[0].colId);

    await updateStyle(context, updateSets);

    context.pushEvent(updateSets);
    debugLog('Updated Style');
  } catch (err) {
    return errorHandler({err: err, context: 'changeStyle', isLast: true});
  }
}

async function formulaBarEnterHandler(context, event) {
  try {
    const ENTER_KEY = 13;

    if (event.which === ENTER_KEY || event.keyCode === ENTER_KEY) {
      const rangeSelections = context.gridOptions.api.getCellRanges();

      if (rangeSelections !== undefined && rangeSelections !== null) {
        if (isSingleCellSelection(rangeSelections)) {
          const updateRowData = (row, column, newValue) => {
            // modifies existing rowData so the user doesn't have to
            // refresh to see the actual data.
            const rowNode = context.gridOptions.api.getRowNode(rowData[row][context.ID]);
            const updated = Object.assign({}, rowNode.data);
            updated[column] = newValue;
            rowNode.setData(updated);
          };

          const rowData = getRowData(context.gridOptions);

          // const row = findVirtualRowIndex(context, rangeSelections[0].start.rowIndex);
          const row = rangeSelections[0].startRow.rowIndex;
          const column = rangeSelections[0].startColumn.colId;

          const editableCol = context.gridOptions.columnDefs.find((columnDef) => {
            return columnDef.field === column;
          });

          if (!editableCol || !editableCol.editable) return;

          let newValue = event.target.value;
          const oldValue = rowData[row][column];

          if (newValue !== oldValue) {
            const columnTable = context.getColumnTable();

            let hasToUpper = false;

            const updateCol = columnTable.find((column) => {
              return column.column_name === column;
            });

            if (updateCol && updateCol.to_upper) {
              newValue = newValue.toUpperCase();

              updateRowData(row, column, newValue);
              hasToUpper = true;
            }

            if (!hasToUpper) updateRowData(row, column, newValue);

            await context.pushUpdatesAndSendWhenStops(rowData[row][context.ID], column, newValue, oldValue);
          }
        }
      }

      event.preventDefault();
    }
  } catch (err) {
    return errorHandler({err: err, context: 'formulaBarEnterHandler', isLast: true});
  }
}

// Input Processing

async function processCellForDatabase(context, rowIndex, colId, oldValue, newValue, id) {
  const callModifyRowDataWithCorrectParams = (obj) => {
    const rowIndex = obj.rowIndex;
    const id = obj.id;

    const context = obj.context;
    const colId = obj.colId;
    const value = obj.value;

    if (rowIndex || rowIndex === 0) {
      modifyRowData(context, rowIndex, colId, value);
    } else {
      modifyRowData(context, null, colId, value, id);
    }
  };

  try {
    if (newValue === '') {
      const trueId = id ? id : context.gridOptions.api.getDisplayedRowAtIndex(rowIndex).data[context.ID];
      return await context.pushUpdatesAndSendWhenStops(trueId, colId, newValue, oldValue);
    }

    const columnTable = context.getColumnTable();
    const schemaTable = await context.getSchemaTable();

    const schema = schemaTable.find((schema) => schema.column_name === colId);
    if (!schema) throw `No column schema with that name.`;

    const column = columnTable.find((column) => column.column_name === colId);
    if (!column) throw `No column with that name.`;

    const dateDataTypes = [
      'date',
      'time without time zone',
      'time with time zone',
      'timestamp without time zone',
      'timestamp with time zone'
    ];

    const numberDataTypes = [
      'integer',
      'bigint',
      'double precision',
      'real'
    ];

    if (schema.data_type === 'character varying' || schema.data_type === 'text') {
      if (schema.data_type === 'character varying' &&
          schema.character_maximum_length !== null &&
          newValue.length > schema.character_maximum_length) {
        throw `Input value (${newValue.length}) exceeds maximum character length of column (${schema.character_maximum_length}).`;
      }

      if (column.to_upper) {
        newValue = newValue.toUpperCase();
        callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: newValue, id: id});
      } else if (column.to_currency) {
        newValue = toCurrencyFormat(newValue);
        callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: newValue, id: id});
      } else if (column.to_date) {
        newValue = toDateFormat(newValue);
        callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: newValue, id: id});
      }
    } else if (dateDataTypes.includes(schema.data_type)) {
      // require forms yyyy-mm-ddThh:MM:ss:mssZ or yyyy-mm-dd
      if (!/^\d\d\d\d-\d\d-\d\d($|T\d\d:\d\d:\d\d\.\d\d\dZ$)/.test(newValue)) {
        throw `Not the correct form for date/timestamp type. Should be: yyyy-mm-ddThh:MM:ss:mssZ or yyyy-mm-dd `;
      }

      // if short form and needs time zone, add in long form portion
      if (schema.data_type !== 'date' && /^\d\d\d\d-\d\d-\d\d$/.test(newValue)) {
        newValue += 'T00:00:00.000Z';
        callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: newValue, id: id});
      }
    } else if (numberDataTypes.includes(schema.data_type)) {
      if (schema.data_type === 'integer' || schema.data_type === 'bigint') {
        if (!/[+-]?[0-9]+/.test(newValue)) {
          throw `Not the correct form for integer/bigint type. Should be a plus or minus and then one or more digits`;
        }

        newValue = parseInt(newValue);
        callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: newValue, id: id});
      } else {
        if (!/[+-]?[0-9]+(\.[0-9]+)?([Ee][+-]?[0-9]+)?/.test(newValue)) {
          throw `Not the correct form for real/double precision type. Should be a plus or minus, any number of digits with a single decimal, and possibly an exponent.`;
        }

        newValue = parseFloat(newValue);
        callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: newValue, id: id});
      }
    } else if (schema.data_type === 'boolean') {
      if (!/^(true|false)$/.test(newValue)) {
        throw `Not the correct form for boolean type. Should be lower case true or false`;
      }

      newValue = newValue === 'true';
      callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: newValue, id: id});
    } else {
      throw `The data type of column to update is currently not supported (${schema.data_type}). Canceling operaton.`;
    }

    const trueId = id ? id : context.gridOptions.api.getDisplayedRowAtIndex(rowIndex).data[context.ID];

    await context.pushUpdatesAndSendWhenStops(trueId, colId, newValue, oldValue);
  } catch (err) {
    callModifyRowDataWithCorrectParams({context: context, rowIndex: rowIndex, colId: colId, value: oldValue, id: id});
    await quickSnackbar(err);
    return errorHandler({err: err, context: 'processCellForDatabase', isLast: true});
  }
}

function toDateFormat(value) {
  // convert - to /
  value = value.replace(/\d( |-)/g, (match) => {
    return match.replace(/( |-)/g, '/');
  });

  // add 0's to single digits
  const parts = value.split('/');
  value = '';

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length == 1) {
      parts[i] = '0' + parts[i];
    }

    value += parts[i] + '/';
  }

  value = value.substring(0, value.length - 1);

  // '01/02' -> '01/02/20'
  if (value.length === 5 && /[\d]{2}\/[\d]{2}/.test(value)) {
    const currYear = new Date().getFullYear().toString().slice(-2);
    value = value += '/' + currYear;
  }

  // '01/02/2020' -> '01/02/20'
  if (value.length === 10 && /[\d]{2}\/[\d]{2}/.test(value)) {
    value = value.substring(0, value.length - 2);
  }

  // '010202' -> '01/02/02'
  if (value.length === 6 && /[\d]{6}/.test(value)) {
    value = value.replace(/[\d]{2}/g, (match) => {
      return match += '/';
    });
    value = value.substring(0, value.length - 1);
  }

  // '0102' -> '01/02/20'
  if (value.length === 4 && /[\d]{4}/.test(value)) {
    const currYear = new Date().getFullYear().toString().slice(-2);

    if (value.slice(-2) == currYear) {
      const dayAndMonth = value.substring(0, 2);
      value = dayAndMonth.replace(/\d/g, (num) => {
        return '0' + num + '/';
      });
      value += currYear;
    } else {
      value = value.replace(/[\d]{2}/g, (match) => {
        return match += '/';
      });
      value = value += currYear;
    }
  }

  // '12' -> '01/02/20'
  if (value.length === 2 && /[\d]{2}/.test(value)) {
    value = value.replace(/\d/g, (num) => {
      return '0' + num + '/';
    });
    const currYear = new Date().getFullYear().toString().slice(-2);
    value = value += currYear;
  }

  return value;
}

function toCurrencyFormat(value) {
  return /[a-zA-Z]/.test(value) ? value : parseFloat(value).toFixed(2);
}

// so the user doesn't have to refresh to see the actual data.
function modifyRowData(context, rowIndex, col, newValue, id) {
  let rowNode;
  if (rowIndex || rowIndex === 0) {
    rowNode = context.gridOptions.api.getDisplayedRowAtIndex(rowIndex);
  } else {
    rowNode = context.gridOptions.api.getRowNode(id);
  }

  const updated = Object.assign({}, rowNode.data);
  updated[col] = newValue;
  rowNode.setData(updated);
}

function findRowFromNodeId(context, nodeId) {
  let row;
  context.gridOptions.api.forEachNode((node) => {
    if (node[context.ID] === nodeId) {
      row = node;
    }
  });

  return row;
}

export {
  setFilter,
  searchForCell,
  replaceCell,
  searchForColumn,
  toggleLoadAll,
  toggleGetAll,
  refresh,
  changeStyle,
  formulaBarEnterHandler,
  processCellForDatabase,
  toCurrencyFormat,
  modifyRowData,
  findRowFromNodeId
};