import {getRowNodeId} from '../cell_options/cell-navigation';
import {cellStyler} from '../cell_options/cell-styler';
import {handleRowSelect,
  singleCellClick} from '../cell_options/on-cell-clicked';
import {suppressKeyboardEvent} from '../cell_options/suppress-keyboard-event';
import {valueEditor} from '../cell_options/value-editor';
import {valueFormatter} from '../cell_options/value-formatter';
import {processCellForClipboard,
  processCellFromClipboard} from '../cell_options/clipboard-processing';
import {CustomHeader} from '../custom_header/custom-header';
import {getMainMenuItems} from '../custom_menus/main-menu-items';
import {getGridContextMenuItems} from '../custom_menus/context-menu-items';
import {noRowsOverlay} from '../overlays/no-rows-overlay';
import {gridOptionsDynamicConfig} from './grid-options-dynamic-config';
import {getRowData,
  isSingleCellSelection,
  changeFormulaBar,
  resolveExpressionStatements,
  errorHandler,
  debugLog,
  isEquivalent,
  fixFloatError,
  findIndexOfObjInArr} from '../utility/utility';
import {setFilter,
  searchForCell,
  replaceCell,
  searchForColumn,
  toggleLoadAll,
  refresh,
  changeStyle,
  formulaBarEnterHandler,
  processCellForDatabase} from '../actions/grid-functions';
import {undo} from '../actions/undo';
import {keyPressHandler} from '../actions/key-press-handler';

async function gridSetup(context) {
  const selectionSummer = () => {
    const findMinMax = (a, b) => {
      if (a > b) {
        const temp = b;
        b = a;
        a = temp;
      }

      return [a, b];
    };

    const findColIndexes = () => {
      let startColIndex = -1;
      let endColIndex = -1;

      for (let i = 0; i < columns.length; i++) {
        if (startColId === columns[i].colId) {
          startColIndex = i;
        }

        if (endColId === columns[i].colId) {
          endColIndex = i;
        }

        if (startColIndex !== -1 && endColIndex !== -1) {
          break;
        }

        if (i >= columns.length - 1) {
          console.log('could not find column');
        }
      }

      return [startColIndex, endColIndex];
    };

    const sumRange = () => {
      const columnTable = context.getColumnTable();
      let sum = 0;

      for (let i = startRowIndex; i <= endRowIndex; i++) {
        const row = context.gridOptions.api.getDisplayedRowAtIndex(i);

        for (let j = startColIndex; j <= endColIndex; j++) {
          const colIsData = columns[j].colId !== context.COSMETIC_ID && columns[j].colId !== context.ID && columns[j].colId !== 'ag-Grid-AutoColumn';
          const dataIsDefined = row.data !== undefined && row.data[columns[j].colId] !== undefined && row.data[columns[j].colId] !== null;
          if (colIsData && dataIsDefined) {
            const column = columnTable.find((column) => column.column_name === columns[j].colId);
            let sumToAdd = 0;

            const isExpression = row.data[columns[j].colId].search(/=/) === 0;
            if (isExpression) {
              const backendFormulaResult = parseFloat(context.gridOptions.api.getDisplayedRowAtIndex(0)['expvalue_' + columns[j].colId + '_' + row.data[context.COSMETIC_ID]]);
              sumToAdd = backendFormulaResult;
            } else if (column.horizontal_formula && row.data[columns[j].colId] === '') {
              const formula = column.horizontal_formula.replace(/{i}/g, row.data[context.COSMETIC_ID]);
              const result = resolveExpressionStatements(formula, context, rowData, columnTable);
              sumToAdd = result;
            } else {
              const value = row.data[columns[j].colId].replace(/(,|\$)/, '');

              if (!isNaN(value) && value !== '' && value !== ' ') {
                sumToAdd = value;
              }
            }

            sumToAdd = fixFloatError(parseFloat(sumToAdd));

            sum += sumToAdd;
            sum = fixFloatError(sum);
          }
        }
      }

      return sum;
    };

    const rowData = getRowData(context.gridOptions);
    const columns = context.gridOptions.columnApi.getAllGridColumns();
    const rangeSelections = context.gridOptions.api.getCellRanges();

    if (rangeSelections === null) return;

    let sum = 0;
    let startRowIndex;
    let startColId;
    let endRowIndex;
    let endColId;
    let startColIndex;
    let endColIndex;

    rangeSelections.forEach((rangeSelection) => {
      startRowIndex = rangeSelection.startRow.rowIndex;
      startColId = rangeSelection.startColumn.colId;

      endRowIndex = rangeSelection.endRow.rowIndex;
      endColId = rangeSelection.columns[rangeSelection.columns.length > 1 ? rangeSelection.columns.length - 1 : 0].colId;

      [startColIndex, endColIndex] = findColIndexes();

      [startRowIndex, endRowIndex] = findMinMax(startRowIndex, endRowIndex);
      [startColIndex, endColIndex] = findMinMax(startColIndex, endColIndex);

      sum += sumRange();
      sum = fixFloatError(sum);
    });

    document.getElementById(context.sumLabel).innerHTML = `SUM: ${sum}`;
  };

  try {
    // Toggle header bar
    document.getElementById(context.gridDiv).style.marginTop = '0vh';
    document.getElementById(context.gridDiv).style.height = '92%';

    setGridOptions(context);

    // space to load grid into
    const gridDiv = document.querySelector(`#${context.gridDiv}`);
    gridDiv.classList.remove('ag-fresh');
    gridDiv.classList.add('ag-theme-balham');

    // set buttons/etc at runtime since the html is templated.
    if (document.getElementById('decrease-decimal-button') !== null) {
      document.getElementById('decrease-decimal-button').onclick = () => changeStyle(context, 'decimal', '-');
      document.getElementById('increase-decimal-button').onclick = () => changeStyle(context, 'decimal', '+');
      document.getElementById('border-button').onclick = () => changeStyle(context, 'border');
      document.getElementById('bold-button').onclick = () => changeStyle(context, 'bold');
      document.getElementById('color-selected-cells-font-button').onclick = () => changeStyle(context, 'color', 'ft');
      document.getElementById('ft-color-picker').onchange = () => changeStyle(context, 'color', 'ft');
      document.getElementById('color-selected-cells-button-2').onclick = () => changeStyle(context, 'color', 'bg', 2);
      document.getElementById('bg-color-picker-2').onchange = () => changeStyle(context, 'color', 'bg', 2);
      document.getElementById('color-selected-cells-button').onclick = () => changeStyle(context, 'color', 'bg');
      document.getElementById('bg-color-picker').onchange = () => changeStyle(context, 'color', 'bg');
      document.getElementById('undo-grid-button').onclick = () => undo(context);
      document.getElementById('refresh-grid-button').onclick = () => refresh(context);

      document.getElementById('load-grid-button').onclick = () => toggleLoadAll(context);

      document.getElementById('filter-submit-button').onclick = () => setFilter(context);
      document.getElementById('search-column-submit-button').onclick = () => searchForColumn(context);
      document.getElementById('search-cell-submit-button').onclick = () => searchForCell(context);
      document.getElementById('replace-cell-submit-button').onclick = () => replaceCell(context);
    }

    await gridOptionsDynamicConfig(context, true);

    if (context.params.options.sumBar && context.params.options.formulaBar) {
      /* Both formula bar and sum bar */

      const sheet = document.getElementById(context.innerView);
      const mGrid = document.getElementById(context.gridDiv);

      if (sheet !== null & mGrid !== null) {
        sheet.style.height = '86vh';
        mGrid.style.height = '87.5%';

        document.getElementById(context.outerView).classList.remove('vspace40');
        document.getElementById(context.outerView).classList.add('vspace10');

        const formulaBar = document.createElement('textarea');
        formulaBar.id = context.formulaBar;
        gridDiv.parentNode.insertBefore(formulaBar, gridDiv.nextSibling);

        context.gridOptions.api.addEventListener('cellClicked', (event) => {
          if (isSingleCellSelection(context.gridOptions.api.getCellRanges()) && event.value !== undefined) {
            changeFormulaBar(context, event.value);
          }
        });

        context.formulaBarEventListener = (event) => formulaBarEnterHandler(context, event);
        formulaBar.addEventListener('keydown', context.formulaBarEventListener);

        const sumLabel = document.createElement('label');
        sumLabel.id = context.sumLabel;
        sumLabel.innerHTML = 'SUM: ';
        sumLabel.style.float = 'right';
        sumLabel.style.marginRight = '10vw';
        sumLabel.style.marginTop = '-0.5vh';
        gridDiv.parentNode.insertBefore(sumLabel, formulaBar.nextSibling);

        context.gridOptions.api.addEventListener('rangeSelectionChanged', selectionSummer);
      } else {
        console.log('Formula bar or sum bar didn\'t load correctly');
      }
    } else if (context.params.options.formulaBar) {
      /* Only formula bar */
      const sheet = document.getElementById(context.innerView);
      const mGrid = document.getElementById(context.gridDiv);

      if (sheet !== null & mGrid !== null) {
        sheet.style.height = '82.5vh';
        mGrid.style.height = '89%';
        const formulaBar = document.createElement('textarea');
        formulaBar.id = context.formulaBar;
        gridDiv.parentNode.insertBefore(formulaBar, gridDiv.nextSibling);

        context.gridOptions.api.addEventListener('cellClicked', (event) => {
          if (isSingleCellSelection(context.gridOptions.api.getCellRanges()) && event.value !== undefined) {
            changeFormulaBar(context, event.value);
          }
        });

        context.formulaBarEventListener = (event) => formulaBarEnterHandler(context, event);
        formulaBar.addEventListener('keydown', context.formulaBarEventListener);
      } else {
        console.log('Formula bar didn\'t load correctly');
      }
    } else if (context.params.options.sumBar) {
      /* Only sum bar */

      const sheet = document.getElementById(context.innerView);
      const mGrid = document.getElementById(context.gridDiv);

      if (sheet !== null & mGrid !== null) {
        sheet.style.height = '82.5vh';
        mGrid.style.height = '90.5%';

        const sumLabel = document.createElement('label');
        sumLabel.id = context.sumLabel;
        sumLabel.innerHTML = 'SUM: ';
        sumLabel.style.float = 'right';
        sumLabel.style.marginRight = '10vw';
        gridDiv.parentNode.insertBefore(sumLabel, gridDiv.nextSibling);

        context.gridOptions.api.addEventListener('rangeSelectionChanged', selectionSummer);
      } else {
        console.log('Sum bar didn\'t load correctly');
      }
    }

    /* this is for autosaving of cell data */
    context.gridOptions.api.addEventListener('cellValueChanged', async (event) => {
      try {
        if (event.newValue !== event.oldValue) {
          await processCellForDatabase(context, event.rowIndex, event.column.colId, event.oldValue, event.newValue);
        }
      } catch (err) {
        return errorHandler({err: err, context: 'cellValueChanged', isLast: true});
      }
    });

    /* Deals with most instances of keypresses. */
    context.keyPressEventListener = (event) => keyPressHandler(context, event);
    document.addEventListener('keydown', context.keyPressEventListener, true);

    const serverSideDatasource = () => {
      return {
        async getRows(params) {
          try {
            context.setLoading(true);
            console.log('getting rows...');

            // Add default sort
            const defaultSort = context.getDefaultSort();
            if (defaultSort) {
              defaultSort.forEach((sort) => {
                const newSort = findIndexOfObjInArr(sort, params.request.sortModel) === -1;
                if (newSort) {
                  params.request.sortModel.push(sort);
                }
              });
            }

            // Add aggregation
            if (context.params.options.rowAgg) {
              const rowAgg = context.params.options.rowAgg;
              params.request.valueCols = [];

              rowAgg.forEach((agg) => {
                params.request.valueCols.push({field: agg.field, func: agg.func, type: agg.type});
              });
            }

            // Add rowGroup filter
            if (context.params.options.rowGroupFilter) {
              params.request.rowGroupFilter = context.params.options.rowGroupFilter;
            }

            // Add other options
            params.request.suppressTableSplit = context.params.options.suppressTableSplit;

            console.log('params.request');
            console.log(params.request);
            const response = await getResponse(params.request, context.filterPattern);

            // if(!response.success){params.failCallback();}

            let lastRow;

            response.lastRow === 0 ? lastRow = 0 : lastRow = response.lastRow;

            context.lastRow = lastRow;

            // This keeps the users position after a refresh.
            // if (context.lastDisplayedRow > 0) {
            //   setTimeout(() => {
            //     console.log(`master ensure going to: ${context.lastDisplayedRow}`);
            //     context.gridOptions.api.ensureIndexVisible(context.lastDisplayedRow, 'bottom');
            //     context.lastDisplayedRow = 0;
            //   }, 500);
            // }

            setTimeout(() => {
              params.successCallback(response.rows, lastRow);
              context.setLoading(false);
              console.log('done getting rows.');
            });
          } catch (err) {
            console.log('YIKES');
            errorHandler({err: err, context: 'getRows', isLast: true});
            return params.successCallback([], 1);
          }
        }
      };
    };

    const getResponse = async (request, filterPattern) => {
      try {
        const finalRequest = [];
        finalRequest.push({
          request: request,
          filterPattern: filterPattern,
          gridName: context.getGridName(),
          additionalData: context.getAdditionalData(),
          altColumnTable: context.params.options.altColumnTable,
          filter: context.getFilter()
        });

        const response = await context.sendRequest('api/ag-grid-spreadsheet/', 'getRows', finalRequest);

        debugLog('Successfully Got Rows');

        return response;
      } catch (err) {
        return errorHandler({err: err, context: 'getResponse'});
      }
    };

    const datasource = serverSideDatasource();
    context.gridOptions.api.setServerSideDatasource(datasource);
  } catch (err) {
    return errorHandler({err: err, context: 'gridSetup', isLast: true});
  }
}

function setGridOptions(context) {
  const total = (values) => {
    console.log('parseIntAggregator');
    let sum = 0;
    values.forEach((value) => {
      sum += parseInt(value.replace(/\$/, ''));
    });
    console.log(sum);
    return sum;
  };

  let groupsBeingUsed = false;
  if (context.params.options.rowGroup) {
    groupsBeingUsed = context.params.options.rowGroup.length !== 0;
  }

  let cacheBlockSize = 200;

  if (groupsBeingUsed) {
    cacheBlockSize = 10000;
  }

  context.gridOptions = {
    rowModelType: 'serverSide',
    // fetch n rows at a time
    cacheBlockSize: cacheBlockSize,
    rowHeight: 30,
    // only keep 50 blocks of rows
    // maxBlocksInCache: 50,
    enableRangeSelection: true,
    suppressMovableColumns: true,
    stopEditingWhenCellsLoseFocus: true,
    suppressScrollOnNewData: true,
    enableCellChangeFlash: true,
    sideBar: false,
    headerHeight: 75,
    onCellClicked: function(params) {
      handleRowSelect(params, this);
      singleCellClick(params, this);
    },
    components: {
      agColumnHeader: CustomHeader,
      noRowsOverlay: noRowsOverlay
    },
    suppressAggFuncInHeader: false,
    aggFuncs: {
      'total': total
    },
    autoGroupColumnDef: {
      headerName: 'Grouping', field: 'grouping', width: 160
    },
    onRowGroupOpened: (params) => {
      let level;
      if (params.data.year === undefined && params.data.month === undefined) {
        level = 1;
      } else if (params.data.year && params.data.month === undefined) {
        level = 2;
      } else if (params.data.year && params.data.month) {
        level = 3;
      }

      const group = {
        firm: params.data.firm,
        year: params.data.year,
        month: params.data.month,
        level: level
      };

      if (params.node.expanded) {
        const newExpansion = findIndexOfObjInArr(group, context.expandedGroups) === -1;
        if (newExpansion) {
          context.expandedGroups.push(group);
        }
      } else {
        context.expandedGroups = context.expandedGroups.filter((grp) => {
          return !isEquivalent(grp, group);
        });
      }
    },
    getMainMenuItems: getMainMenuItems,
    getContextMenuItems: getGridContextMenuItems,
    noRowsOverlayComponent: 'noRowsOverlay',
    processCellForClipboard: processCellForClipboard,
    processCellFromClipboard: processCellFromClipboard,
    getRowNodeId: getRowNodeId,
    context: context
  };

  context.gridOptions.defaultColDef = {
    editable: true,
    resizable: true,
    sortable: true,
    width: 130,
    cellEditor: valueEditor,
    cellStyle: cellStyler,
    valueFormatter: valueFormatter,
    suppressKeyboardEvent: suppressKeyboardEvent,
    menuTabs: ['generalMenuTab']
  };
}

export {
  gridSetup
};