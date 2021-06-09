import {getDBColumnTable,
  copyStringToClipboard,
  loading,
  errorHandler,
  toTitleCase,
  debugLog,
  timeoutPromise,
  endSnackbar} from '../utility/utility';
import {refresh} from '../actions/grid-functions';

export function getMainMenuItems(params) {
  const getPropertiesSubMenu = (params, targetColumn) => {
    const propertiesSubMenu = [];

    propertiesSubMenu.push({name: 'Change Column Name', action: () => changeColumnName(params)});
    propertiesSubMenu.push({name: 'Change Column Width', action: () => changeColumnWidth(params)});

    if (targetColumn.horizontal_formula !== null && targetColumn.horizontal_formula !== '') {
      propertiesSubMenu.push({name: 'Change Horizontal Formula', action: () => changeHorizontalFormula(params)});
    } else {
      propertiesSubMenu.push({name: 'Set Horizontal Formula', action: () => changeHorizontalFormula(params)});
    }

    propertiesSubMenu.push('separator');

    if (targetColumn.hide === true) {
      propertiesSubMenu.push({name: 'Show Column', action: () => showColumn(params)});
    } else {
      propertiesSubMenu.push({name: 'Hide Column', action: () => hideColumn(params)});
    }

    if (targetColumn.to_upper === true) {
      propertiesSubMenu.push({name: 'Un-Force Uppercase', action: () => forceProperty(params, 'Uppercase', false)});
    } else {
      propertiesSubMenu.push({name: 'Force Uppercase', action: () => forceProperty(params, 'Uppercase', true)});
    }

    if (targetColumn.to_currency === true) {
      propertiesSubMenu.push({name: 'Un-Force Currency Format', action: () => forceProperty(params, 'CurrencyFormat', false)});
    } else {
      propertiesSubMenu.push({name: 'Force Currency Format', action: () => forceProperty(params, 'CurrencyFormat', true)});
    }

    if (targetColumn.to_date === true) {
      propertiesSubMenu.push({name: 'Un-Force Date Format', action: () => forceProperty(params, 'DateFormat', false)});
    } else {
      propertiesSubMenu.push({name: 'Force Date Format', action: () => forceProperty(params, 'DateFormat', true)});
    }

    if (targetColumn.editable === true || targetColumn.editable === null) {
      propertiesSubMenu.push({name: 'Lock Column', action: () => forceProperty(params, 'Editable', false)});
    } else {
      propertiesSubMenu.push({name: 'Unlock Column', action: () => forceProperty(params, 'Editable', true)});
    }

    if (targetColumn.admin_only === true) {
      propertiesSubMenu.push({name: 'Make Column Visible To All', action: () => forceProperty(params, 'AdminOnly', false)});
    } else {
      propertiesSubMenu.push({name: 'Make Column Admin-Only', action: () => forceProperty(params, 'AdminOnly', true)});
    }

    return propertiesSubMenu;
  };

  const getInsertOrDeleteColumnsSubMenu = (params) => {
    const insertOrDeleteColumnsSubMenu = [];

    insertOrDeleteColumnsSubMenu.push({name: 'Insert Column Left', action: () => insertColumn(params, 'left')});
    insertOrDeleteColumnsSubMenu.push({name: 'Insert Column Right', action: () => insertColumn(params, 'right')});
    insertOrDeleteColumnsSubMenu.push('separator');
    insertOrDeleteColumnsSubMenu.push({name: 'Insert Column Left And Copy', action: () => insertColumn(params, 'left', true)});
    insertOrDeleteColumnsSubMenu.push({name: 'Insert Column Right And Copy', action: () => insertColumn(params, 'right', true)});
    insertOrDeleteColumnsSubMenu.push('separator');
    // insertOrDeleteColumnsSubMenu.push({name: 'Insert 5 Columns Left', action: () => insertColumn(params, 'left', false, 5)});
    // insertOrDeleteColumnsSubMenu.push({name: 'Insert 5 Columns Right', action: () => insertColumn(params, 'right', false, 5)});
    // insertOrDeleteColumnsSubMenu.push('separator');
    insertOrDeleteColumnsSubMenu.push({name: 'Delete Column', action: () => deleteColumn(params)});

    return insertOrDeleteColumnsSubMenu;
  };

  try {
    const columnTable = params.context.getColumnTable();
    console.log(columnTable);
    console.log(params);
    const targetColumn = columnTable.find((column) => {
      return column.column_name === params.column.colId;
    });
    if (!targetColumn) throw `Didn't find column`;

    const mainMenu = [];

    mainMenu.push({name: 'Search Column For...', action: () => search(params)});
    mainMenu.push('separator');

    const context = params.context;

    mainMenu.push({name: 'Change Column Properties', subMenu: getPropertiesSubMenu(params, targetColumn)});
    mainMenu.push('separator');
    mainMenu.push({name: 'Insert/Delete Columns', subMenu: getInsertOrDeleteColumnsSubMenu(params)});
    mainMenu.push('separator');
    mainMenu.push({name: 'Freeze Columns To Left', action: () => pinColumns(params)});

    // only have un-freeze on the list if something is frozen.
    let somethingIsPinned = false;

    for (let i = targetColumn.id; i >= 0; i--) {
      if (columnTable[i].column_name !== context.COSMETIC_ID && columnTable[i].column_name !== context.ID && columnTable[i].pinned === 'left') {
        somethingIsPinned = true;
      }
    }

    if (somethingIsPinned) {
      mainMenu.push({name: 'Un-Freeze Columns to Left', action: () => unPinColumns(params)});
    }

    mainMenu.push('separator');
    mainMenu.push({name: 'Copy Column Formula Name', action: () => copyColumnFormulaName(params)});
    mainMenu.push('separator');
    mainMenu.push({name: 'Copy Formula Down Column', action: () => copyFormulaDownColumn(params)});

    mainMenu.push('separator');
    mainMenu.push({name: 'Sort Asc', action: () => sortColumn(params, 'asc'), icon: '<i class="fa fa-sort-numeric-asc" aria-hidden="true"></i>'});
    mainMenu.push({name: 'Sort Desc', action: () => sortColumn(params, 'desc'), icon: '<i class="fa fa-sort-numeric-desc" aria-hidden="true"></i>'});
    mainMenu.push({name: 'Sort By Id (Default)', action: () => params.api.setSortModel([{colId: params.column.colId, sort: ''}])});

    return mainMenu;
  } catch (err) {
    errorHandler({err: err, context: 'getMainMenuItems', isLast: true});
    return [];
  }
}

const sortColumn = (params, direction) => {
  const sortModel = params.api.getSortModel();

  if (sortModel.length !== 0) {
    let found = false;

    for (let i = 0; i < sortModel.length; i++) {
      if (sortModel[i].colId === params.column.colId) {
        sortModel[i].sort = direction;
        found = true;
        break;
      }
    }

    if (!found) {
      sortModel.push({
        colId: params.column.colId,
        sort: direction
      });
    }

    params.api.setSortModel(sortModel);
  } else {
    params.api.setSortModel([{colId: params.column.colId, sort: direction}]);
  }
};

/*
  Currently there's a bug that the main menu doesn't open after changing the name of the column.
  Refreshing page fixes. TODO
*/
const changeColumnName = async (params) => {
  const findHeaderName = (params, oldColumns) => {
    // if the column is in the old data and it has a custom_header_name, then
    // use that.
    let headerName = oldColumns.find((col) => {
      return col.column_name === params.column.colId && col.custom_header_name !== null;
    });

    if (headerName) {
      headerName = headerName.custom_header_name;
    } else {
      // otherwise, set the name to be the title case version of the ID.
      headerName = params.column.colId.replace(/_/g, ' ');
      headerName = toTitleCase(headerName);
    }

    return headerName;
  };

  const generateNewFieldFromOriginalName = (originalName) => {
    let newField = originalName.replace(/[ \/'\.,\[\]!@#\$%&\*\{\}\|\\":;\?><\+-=~`\(\)]/g, '_');
    const regex = new RegExp('^\\d');
    newField = newField.replace(regex, '_' + newField.charAt(0));
    newField = newField.replace(/0/g, 'zero');
    newField = newField.replace(/1/g, 'one');
    newField = newField.replace(/2/g, 'two');
    newField = newField.replace(/3/g, 'three');
    newField = newField.replace(/4/g, 'four');
    newField = newField.replace(/5/g, 'five');
    newField = newField.replace(/6/g, 'six');
    newField = newField.replace(/7/g, 'seven');
    newField = newField.replace(/8/g, 'eight');
    newField = newField.replace(/9/g, 'nine');
    newField = newField.toLowerCase();
    newField = newField.substring(0, 51);

    return newField;
  };

  const renameColumn = async (oldColumn, newColumn) => {
    try {
      const context = params.context;

      const data = {
        oldColumnName: oldColumn,
        newColumnName: newColumn,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'renameColumn', data);

      debugLog('Renamed Column');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'renameColumn'});
    }
  };

  const setCustomHeaderName = async (columnName, customHeaderName) => {
    try {
      const context = params.context;

      const data = {
        columnName: columnName,
        customHeaderName: customHeaderName,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'setCustomHeaderName', data);

      debugLog('Set Custom Header Name');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'setCustomHeaderName'});
    }
  };

  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;

    const oldColumns = await getDBColumnTable(context);
    const headerName = findHeaderName(params, oldColumns);
    const originalName = prompt('Enter new name of column:', headerName);

    // Don't allow blank input or names of the form 'styleattrib_' since that is
    // reserved for the grid styling information
    if (originalName != null &&
        originalName != '' &&
        !/styleattrib_[\w]+/.test(originalName)) {
      const newField = generateNewFieldFromOriginalName(originalName);

      let duplicate = false;

      // Make sure the new column name isn't already in columnDefs
      for (let i = 0; i < gridOptions.columnDefs.length; i++) {
        if (gridOptions.columnDefs[i].field === newField) {
          if (gridOptions.columnDefs[i].headerName === originalName) {
            duplicate = true;
            break;
          } else {
            break;
          }
        }
      }

      let columnIndex;
      let oldHeaderName;
      let oldField;

      if (!duplicate) {
        for (let i = 0; i < gridOptions.columnDefs.length; i++) {
          if (gridOptions.columnDefs[i].field === params.column.colId) {
            columnIndex = i;
            oldHeaderName = gridOptions.columnDefs[i].headerName;
            oldField = gridOptions.columnDefs[i].field;

            gridOptions.columnDefs[i].headerName = originalName;
            gridOptions.columnDefs[i].field = newField;

            break;
          }
        }
      }

      const updates = [];
      const updateSets = [];

      await loading(context, true, 'Changing Column Name...\nPlease Wait.');

      updates.push({
        action: 'renameColumn',
        columnIndex: columnIndex,
        newField: newField,
        newHeaderName: originalName,
        oldField: oldField,
        oldHeaderName: oldHeaderName,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      });
      updateSets.push(updates);

      setColumnDefsAndMaintainVisibility(gridOptions, gridOptions.columnDefs, newField);

      await renameColumn(params.column.colId, newField);
      await setCustomHeaderName(newField, originalName);
      await context.setColumnTable();

      context.pushEvent(updateSets);
      await loading(context, false);
      debugLog('Changed Column Name');
      return true;
    } else {
      return true;
    }
  } catch (err) {
    return errorHandler({err: err, context: 'changeColumnName', isLast: true});
  }
};

/*
  Currently there's a styling issue where the main menu button is only moving by px and thus on big widths it looks weird TODO
*/
const changeColumnWidth = async (params) => {
  const setColumnWidth = async (colId, width) => {
    try {
      const context = params.context;

      const data = {
        colId: colId,
        width: width,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'setColumnWidth', data);

      debugLog('Set Column Width');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'setColumnWidth'});
    }
  };

  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const columnDefs = gridOptions.columnDefs;
    const context = params.context;

    let width = prompt('Please enter a width (current is ' + params.column.colDef.width + '): ');

    if (width !== null && width !== '' && width !== ' ' && !isNaN(width)) {
      if (width < 50) {
        width = '50';
      }

      if (width > 1000) {
        width = '1000';
      }

      const columnIndex = gridOptions.columnDefs.findIndex((columnDef) => {
        return columnDef.field === params.column.colId;
      });
      if (!columnIndex) throw `Could not find columnIndex`;

      const updates = [];
      const updateSets = [];

      await loading(context, true, 'Changing Column Width...\nPlease Wait.');

      updates.push({
        action: 'changeColumnWidth',
        columnIndex: columnIndex,
        field: params.column.colId,
        oldWidth: params.column.colDef.width,
        newWidth: width,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      });
      updateSets.push(updates);

      columnDefs[columnIndex].width = parseInt(width);
      setColumnDefsAndMaintainVisibility(gridOptions, columnDefs);

      await setColumnWidth(params.column.colId, width);
      await context.setColumnTable();

      context.pushEvent(updateSets);
      await loading(context, false);
      return true;
    } else {
      return true;
    }
  } catch (err) {
    return errorHandler({err: err, context: 'changeColumnWidth', isLast: true});
  }
};

/*
  Currently there's a bug where you have to refresh the page to see the horizontal formula appear. TODO
*/
const changeHorizontalFormula = async (params) => {
  const setHorizontalFormula = async (colId, formula) => {
    try {
      const context = params.context;

      const data = {
        colId: colId,
        formula: formula,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'setHorizontalFormula', data);

      debugLog('Set Horizontal Formula');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'setHorizontalFormula'});
    }
  };

  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;

    const columns = context.getColumnTable();

    let oldFormula = columns.find((column) => {
      return column.column_name === params.column.colId;
    });
    if (oldFormula) {
      oldFormula = oldFormula.horizontal_formula !== null ? oldFormula.horizontal_formula : '';
    } else {
      oldFormula = '';
    }

    let formula = prompt('Please enter formula replacing index with {i}:\nEx. =column_name{i}\n', oldFormula);
    console.log('formula');
    console.log(formula);
    if (formula === null) formula = '';

    if (formula !== oldFormula) {
      const columnIndex = gridOptions.columnDefs.findIndex((columnDef) => {
        return columnDef.field === params.column.colId;
      });
      if (!columnIndex) throw `Didn't find columnIndex`;

      const updates = [];
      const updateSets = [];

      await loading(context, true, 'Setting Horizontal Formula...\nPlease Wait.');

      updates.push({
        action: 'changeHorizontalFormula',
        columnIndex: columnIndex,
        field: params.column.colId,
        oldFormula: oldFormula,
        newFormula: formula,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      });
      updateSets.push(updates);

      await setHorizontalFormula(params.column.colId, formula);
      context.pushEvent(updateSets);

      await refresh(context);
      await loading(context, false);
      return true;
    } else {
      return true;
    }
  } catch (err) {
    return errorHandler({err: err, context: 'changeHorizontalFormula', isLast: true});
  }
};

const insertColumn = async (params, side, copy = false, numberOfColumns = 1, updates = []) => {
  const generateNewColumn = (newName) => {
    let headerName = newName.replace(/_/g, ' ');
    headerName = toTitleCase(headerName);

    const objectString = '{"headerName": "' + headerName +
                        '", "field": "' + newName +
                        '", "hide": false}';

    return JSON.parse(objectString);
  };

  const generateUniqueColumnName = (name, gridOptions) => {
    function convertStringWithNumbersToWords(string) {
      const convertNumToWords = (num) => {
        const digits = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
        return digits[num];
      };

      for (let i = 0; i < string.length; i++) {
        if (/^\d$/.test(string[i])) {
          const regex = RegExp(string[i]);
          string = string.replace(regex, convertNumToWords(parseInt(string[i])));
        }
      }

      return string;
    }

    function convertStringWithWordsToNumbers(string) {
      function convertWordsToNum(word) {
        const digits = {
          'zero': 0,
          'one': 1,
          'two': 2,
          'three': 3,
          'four': 4,
          'five': 5,
          'six': 6,
          'seven': 7,
          'eight': 8,
          'nine': 9
        };

        return digits[word] !== undefined ? digits[word] : word;
      }

      return string.replace(/[a-z]+/g, convertWordsToNum);
    }

    let newName;

    for (let i = 0; i < gridOptions.columnDefs.length; i++) {
      if (gridOptions.columnDefs[i].field === name) {
        name = convertStringWithWordsToNumbers(name);

        const match = name.match(/_([\d]+)/);
        if (match !== null) {
          let number = parseFloat(match[1]);
          number++;
          newName = generateUniqueColumnName(convertStringWithNumbersToWords('new_column_' + number.toString()), gridOptions);
          break;
        } else {
          newName = generateUniqueColumnName(name + '_one', gridOptions);
          break;
        }
      } else {
        newName = name;
      }
    }

    return convertStringWithNumbersToWords(newName);
  };

  const addColumn = async (columnName, columnIndex) => {
    try {
      const context = params.context;

      const data = {
        columnName: columnName,
        columnIndex: columnIndex,
        copy: copy,
        insertLeft: side === 'left',
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable,
        suppressTableSplit: context.params.options.suppressTableSplit
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'addColumn', data);

      debugLog('Added Column');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'addColumn'});
    }
  };

  const setCustomHeaderName = async (columnName, customHeaderName) => {
    try {
      const context = params.context;

      const data = {
        columnName: columnName,
        customHeaderName: customHeaderName,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'setCustomHeaderName', data);

      debugLog('setCustomHeaderName');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'setCustomHeaderName'});
    }
  };

  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;

    await loading(context, true, 'Adding Column(s)...\nPlease Wait.');

    const name = 'new_column';
    const newName = generateUniqueColumnName(name, gridOptions);
    const columnDefs = JSON.parse(JSON.stringify(gridOptions.columnDefs));
    const columns = await getDBColumnTable(context);

    let columnIndex = columns.findIndex((column) => {
      return column.column_name === params.column.colId;
    });
    if (!columnIndex) throw `Couldn't find columnIndex`;

    columnIndex = side === 'left' ? columnIndex : columnIndex + 1;

    for (let i = 0; i < columnDefs.length; i++) {
      if (columnDefs[i].field === params.column.colId) {
        const newColumn = generateNewColumn(newName);

        // extend array
        gridOptions.columnDefs.push({
          headerName: null,
          field: null,
          hide: false
        });

        if (side === 'left') {
          for (let j = gridOptions.columnDefs.length - 1; j > i; j--) {
            gridOptions.columnDefs[j] = JSON.parse(JSON.stringify(gridOptions.columnDefs[j - 1]));
          }
          gridOptions.columnDefs[i] = newColumn;
        } else {
          for (let j = gridOptions.columnDefs.length - 1; j > (i + 1); j--) {
            gridOptions.columnDefs[j] = JSON.parse(JSON.stringify(gridOptions.columnDefs[j - 1]));
          }
          gridOptions.columnDefs[i + 1] = newColumn;
        }

        break;
      }
    }

    updates.push({
      action: 'insertColumn',
      columnName: newName,
      columnIndex: columnIndex + (numberOfColumns - 1),
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable,
      suppressTableSplit: context.params.options.suppressTableSplit
    });

    // Now to modify the database.
    await addColumn(newName, columnIndex);

    let customName = newName.replace(/_/g, ' ');
    customName = toTitleCase(customName);

    await setCustomHeaderName(newName, customName);

    if (numberOfColumns > 1) {
      numberOfColumns--;

      await insertColumn(params, side, copy, numberOfColumns, updates);

      return true;
    } else {
      const updateSets = [];
      updateSets.push(updates);
      context.pushEvent(updateSets);

      await refresh(context);
      await loading(context, false);
      return true;
    }
  } catch (err) {
    return errorHandler({err: err, context: 'insertColumn', isLast: true});
  }
};

const deleteColumn = async (params) => {
  const removeColumn = async (columnName) => {
    try {
      const context = params.context;

      const data = {
        columnName: columnName,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'removeColumn', data);

      debugLog('Removed Column');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'removeColumn'});
    }
  };

  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const columnName = params.column.colId;
    const context = params.context;
    await loading(context, true, 'Deleting Column...\nPlease Wait.');

    // const rowData = await getDBRowData(context);
    let columnIndex;
    let columnDef;

    for (let i = 0; i < gridOptions.columnDefs.length; i++) {
      if (gridOptions.columnDefs[i].field === columnName) {
        columnIndex = i;

        columnDef = gridOptions.columnDefs[i];

        // remove column from column defs.
        gridOptions.columnDefs.splice(i, 1);

        break;
      }
    }

    const updates = [];
    const updateSets = [];

    updates.push({
      action: 'deleteColumn',
      columnIndex: columnIndex,
      columnDef: columnDef,
      // rowData: rowData,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    });
    updateSets.push(updates);

    // Now to modify the database.
    await removeColumn(columnName);

    context.pushEvent(updateSets);

    await refresh(context);
    await loading(context, false);
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'deleteColumn', isLast: true});
  }
};

const setColumnDefsAndMaintainVisibility = (gridOptions, columnDefs, newName) => {
  gridOptions.api.setColumnDefs(columnDefs);
  gridOptions.api.refreshServerSideStore();

  // reset column visiblity from before setColumnDefs
  // This is used because each time a column is added it resets the hidden/shown
  // columns in the grid. This, however, slows down column adding considerably and
  // I have taken it out for now. TODO: make this more efficient.
  /*
    const currentlyVisibleColumns = gridOptions.columnApi.getAllDisplayedColumns();

    for(let i = 0; i < gridOptions.columnDefs.length; i++){
      for(let j = 0; j < currentlyVisibleColumns.length; j++){
        if(gridOptions.columnDefs[i].field === currentlyVisibleColumns[j].colId){
          gridOptions.columnApi.setColumnVisible(gridOptions.columnDefs[i].field, true);
          break;
        } else {
          gridOptions.columnApi.setColumnVisible(gridOptions.columnDefs[i].field, false);
        }
      }
    }

    if(newName){
      gridOptions.columnApi.setColumnVisible(newName, true);
    }
  */
};

/*
  Currently there's a bug where the column isn't auto-hidden on the screen unless you toggle hiddens or refresh. TODO
*/
const hideColumn = async (params) => {
  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;
    await loading(context, true, 'Hiding Column...\nPlease Wait.');

    // hide column if hidden columns are collapsed, otherwise keep it visible.
    const columns = gridOptions.columnApi.getAllColumns();

    let collapsed = false;

    let columnIndex;

    for (let i = 0; i < columns.length; i++) {
      if (columns[i].visible === false) {
        collapsed = true;
        break;
      }
    }

    if (collapsed) {
      if (params.column.colId) {
        gridOptions.columnApi.setColumnVisible(params.column.colId, false);
      }
    }

    // change hide value in columnDefs
    for (let i = 0; i < gridOptions.columnDefs.length; i++) {
      if (gridOptions.columnDefs[i].field === params.column.colId) {
        gridOptions.columnDefs[i].hide = true;
        columnIndex = i;
      }
    }

    const updates = [];
    const updateSets = [];

    updates.push({
      action: 'hideOrUnhideColumn',
      columnIndex: columnIndex,
      hide: true,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    });
    updateSets.push(updates);

    // change hide value in database
    await hideColumnPoster(params, params.column.colId, true);
    await context.setColumnTable();

    context.pushEvent(updateSets);
    await loading(context, false);
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'hideColumn', isLast: true});
  }
};

const showColumn = async (params) => {
  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;
    await loading(context, true, 'Showing Column...\nPlease Wait.');

    let columnIndex;

    // change hide value in columnDefs
    for (let i = 0; i < gridOptions.columnDefs.length; i++) {
      if (gridOptions.columnDefs[i].field === params.column.colId) {
        gridOptions.columnDefs[i].hide = false;
        columnIndex = i;
      }
    }

    const updates = [];
    const updateSets = [];

    updates.push({
      action: 'hideOrUnhideColumn',
      columnIndex: columnIndex,
      hide: false,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    });
    updateSets.push(updates);

    // change hide value in database
    await hideColumnPoster(params, params.column.colId, false);
    await context.setColumnTable();

    context.pushEvent(updateSets);
    await loading(context, false);
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'showColumn', isLast: true});
  }
};

const hideColumnPoster = async (params, columnName, hide) => {
  try {
    const context = params.context;

    const data = {
      columnName: columnName,
      hide: hide,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    };

    await context.sendRequest('api/ag-grid-spreadsheet/', 'hideColumn', data);

    debugLog('Hid/Showed Column');
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'hideColumnPoster'});
  }
};

const pinColumns = async (params) => {
  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;
    await loading(context, true, 'Pinning Column...\nPlease Wait.');

    const columns = [];

    for (let i = 0; i < gridOptions.columnDefs.length; i++) {
      if (gridOptions.columnDefs[i].field === params.column.colId) {
        for (let j = 0; j < i; j++) {
          if (gridOptions.columnDefs[j].field !== context.COSMETIC_ID && gridOptions.columnDefs[j].field !== context.ID) {
            gridOptions.columnDefs[j].pinned = 'left';
            columns.push(gridOptions.columnDefs[j].field);
          }
        }
      }
    }

    setColumnDefsAndMaintainVisibility(gridOptions, gridOptions.columnDefs);

    await pinColumnsPoster(params, columns, 'left');
    await params.context.setColumnTable();
    await loading(context, false);
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'pinColumns', isLast: true});
  }
};

const unPinColumns = async (params) => {
  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;
    await loading(context, true, 'Un-Pinning Column...\nPlease Wait.');

    const columns = [];

    for (let i = 0; i < gridOptions.columnDefs.length; i++) {
      if (gridOptions.columnDefs[i].field === params.column.colId) {
        for (let j = 0; j < i; j++) {
          if (gridOptions.columnDefs[j].field !== context.COSMETIC_ID && gridOptions.columnDefs[j].field !== context.ID) {
            gridOptions.columnDefs[j].pinned = '';
            columns.push(gridOptions.columnDefs[j].field);
          }
        }
      }
    }

    setColumnDefsAndMaintainVisibility(gridOptions, gridOptions.columnDefs);

    await pinColumnsPoster(params, columns, '');
    await params.context.setColumnTable();
    await loading(context, false);
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'unPinColumns', isLast: true});
  }
};

const pinColumnsPoster = async (params, columns, pinned) => {
  try {
    const context = params.context;

    const data = {
      columns: columns,
      pinned: pinned,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    };

    await context.sendRequest('api/ag-grid-spreadsheet/', 'pinColumn', data);

    debugLog('pinned/unpinned Column');
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'pinColumnsPoster'});
  }
};

const forceProperty = async (params, property, force) => {
  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const context = params.context;
    await loading(context, true, `${(force ? 'Forcing ':'Un-Forcing ') + property}...\nPlease Wait.`);

    const columnIndex = gridOptions.columnDefs.findIndex((columnDef) => {
      return columnDef.field === params.column.colId;
    });
    if (!columnIndex) throw `Couldn't find columnIndex`;

    gridOptions.columnDefs[columnIndex][property.toLowerCase()] = force;

    const action = (force ? 'force':'unforce') + property;

    const data = {
      property: property,
      force: force,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable,
      columnName: params.column.colId
    };

    await context.sendRequest('api/ag-grid-spreadsheet/', 'forceProperty', data);
    await context.setColumnTable();

    const updates = [];
    const updateSets = [];

    updates.push({
      action: action,
      property: property,
      force: force,
      columnIndex: columnIndex,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    });
    updateSets.push(updates);

    context.pushEvent(updateSets);

    debugLog((force ? 'Forced ':'Unforced ') + property);

    if (property === 'Editable' || property === 'AdminOnly') {
      // Refresh the grid
      gridOptions.api.setColumnDefs(gridOptions.columnDefs);
    }
    await loading(context, false);

    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'forceProperty', isLast: true});
  }
};

const copyColumnFormulaName = (params) => {
  copyStringToClipboard(params.column.colId);

  return true;
};

const copyFormulaDownColumn = async (params) => {
  try {
    const columnName = params.column.colId;
    const context = params.context;

    const rowOneFormula = prompt('WARNING: This operation is not undo-able\nEnter row 1 formula to copy into all other rows: ');

    if (rowOneFormula === '' || rowOneFormula === null) {
      await endSnackbar('Formula can\'t be blank.');
    } else {
      await loading(context, true, 'Copying formula down entire column...\nPlease Wait.');

      const data = {
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable,
        columnName: columnName,
        rowOneFormula: rowOneFormula
      };

      // const rowData = await getDBRowData(context);

      // let slimmedRowData = [];

      // for(const i in rowData){
      //   slimmedRowData.push(rowData[i][columnName]);
      // }

      await context.sendRequest('api/ag-grid-spreadsheet/', 'copyFormulaDownColumn', data);

      // let columnIndex;
      // let columnDef;

      // for(let i = 0; i < gridOptions.columnDefs.length; i++){

      //   if(gridOptions.columnDefs[i].field === columnName){

      //     columnIndex = i;

      //     columnDef = gridOptions.columnDefs[i];

      //     //remove column from column defs.
      //     gridOptions.columnDefs.splice(i, 1);

      //     break;
      //   }
      // }

      // let updates = [];
      // let updateSets = [];

      // updates.push({
      //   action: 'copyFormulaDownColumn',
      //   columnIndex: columnIndex,
      //   columnDef: columnDef,
      //   rowData: slimmedRowData,
      //   gridName: context.getGridName(),
      //   altColumnTable: context.params.options.altColumnTable
      // });
      // updateSets.push(updates);

      // context.pushEvent(updateSets);

      await refresh(context);
      await loading(context, false);
    }
  } catch (err) {
    return errorHandler({err: err, context: 'copyFormulaDownColumn', isLast: true});
  }
};

const search = async (params) => {
  const doSearch = () => {
    const displayedRowCount = gridOptions.api.getDisplayedRowCount();

    let nextSearchCellPosition = 0;

    if (gridOptions.api.getFocusedCell() !== null) {
      if (gridOptions.api.getFocusedCell().rowIndex + 1 >= displayedRowCount) {
        nextSearchCellPosition = 0;
      } else {
        nextSearchCellPosition = gridOptions.api.getFocusedCell().rowIndex + 1;
      }
    }

    for (let i = nextSearchCellPosition; i < displayedRowCount; i++) {
      const key = params.column.colId;
      const re = new RegExp(searchPattern.toLowerCase());
      const row = gridOptions.api.getDisplayedRowAtIndex(i);

      if (key !== context.COSMETIC_ID && key !== context.ID && row.data[key] !== null && re.test(row.data[key].toLowerCase())) {
        gridOptions.api.ensureIndexVisible(i, 'middle');
        gridOptions.api.ensureColumnVisible(key);
        gridOptions.api.setFocusedCell(i, key, null);
        break;
      }

      if (i >= displayedRowCount - 1) {
        for (let j = 0; i < displayedRowCount; j++) {
          const key = params.column.colId;
          const re = new RegExp(searchPattern.toLowerCase());
          const row = gridOptions.api.getDisplayedRowAtIndex(j);

          if (key !== context.COSMETIC_ID && key !== context.ID && row.data[key] !== null && re.test(row.data[key].toLowerCase())) {
            gridOptions.api.ensureIndexVisible(j, 'middle');
            gridOptions.api.ensureColumnVisible(key);
            gridOptions.api.setFocusedCell(j, key, null);
            break;
          }

          if (j >= displayedRowCount - 1) {
            debugLog(searchPattern + ' is not in grid');
          }
        }
      }
    }
  };

  const context = params.context;
  const gridOptions = context.gridOptions;
  const defaultValue = params.defaultValue ? params.defaultValue : '';

  const searchPattern = prompt('Searching for: ', defaultValue);

  if (searchPattern === '') {
    gridOptions.api.ensureIndexVisible(0, 'middle');
  } else if (searchPattern === null) {
    // do Nothing
  } else {
    doSearch();

    // give search time to breathe.
    await timeoutPromise(100);

    params.defaultValue = searchPattern;
    search(params);
  }
};