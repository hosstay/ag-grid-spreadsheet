import {getRowData,
  loading,
  errorHandler,
  toTitleCase,
  debugLog} from '../utility/utility';
import {refresh} from '../actions/grid-functions';

export function getGridContextMenuItems(params) {
  const getRowSubMenu = (params) => {
    const rowSubMenu = [];

    rowSubMenu.push({name: 'Insert Row Above', action: () => insertRow(params, true)});
    rowSubMenu.push({name: 'Insert Row Above And Copy', action: () => insertRow(params, true, true)});
    rowSubMenu.push({name: 'Insert Row Below', action: () => insertRow(params, false)});
    rowSubMenu.push({name: 'Insert Row Below And Copy', action: () => insertRow(params, false, true)});
    rowSubMenu.push('separator');
    rowSubMenu.push({name: 'Delete Row', action: () => deleteRow(params)});

    return rowSubMenu;
  };

  const context = params.context;
  const gridOptions = params.api.gridOptionsWrapper.gridOptions;

  const result = [];

  result.push('copy');
  result.push('copyWithHeaders');

  result.push({name: 'Add/Delete Row', subMenu: getRowSubMenu(params)});

  if (gridOptions.columnDefs.length === 1) {
    result.push('separator');
    result.push({name: 'Initialize Grid', action: () => initializeGrid(params)});
  }

  // if (context.params.options.excelExport) {
  //   const excelExport = context.params.options.excelExport;
  //   result.push({name: excelExport.actionName, action: () => excelExport.func(params)});
  //   // add roles and person specific access back in later?
  //   // const roles = excelExport.roles;
  //   // if (roles) {
  //   // roles.forEach((role) => {
  //   //   let added = false;

  //   //   if (context.checkRoleAccess(role.name)) { 
  //   //     result.push({name: role.actionName, action: () => role.func(params)});
  //   //     added = true;
  //   //   }

  //   //   if (!added && role.additionalPersons) {
  //   //     role.additionalPersons.forEach((person) => {
  //   //       if (context.firstName === person.firstName && context.lastName === person.lastName) {
  //   //         result.push({name: role.actionName, action: () => role.func(params)});
  //   //       }
  //   //     });
  //   //   }
  //   // });
  //   // } else {
  //   //   result.push({name: excelExport.actionName, action: () => excelExport.func(params)});
  //   // }
  // }

  return result;
}

const insertRow = async (params, insertAbove, copy = false, numberOfRows = 1, updateSets = []) => {
  const addRow = async (id, insertAbove, copy) => {
    try {
      const context = params.context;
      const payload = {
        id: id,
        insertAbove: insertAbove,
        copy: copy,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'addRow', payload);

      debugLog('Added Row');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'addRow'});
    }
  };

  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const rowData = getRowData(gridOptions);
    const context = params.context;

    await loading(context, true, 'Adding Row(s)...\nPlease Wait.');

    let cosmeticId;

    // params.node will be null in the case that the user adds a row but has none
    // of the previous rows selected.
    if (params.node !== null) {
      if (params.node.data !== undefined) {
        cosmeticId = params.node.data[context.COSMETIC_ID];
      } else {
        cosmeticId = 1;
      }
    } else {
      if (insertAbove === true) {
        cosmeticId = 1;
      } else {
        cosmeticId = rowData.length;
      }
    }

    const targetRow = rowData.find((row) => row[context.COSMETIC_ID] === cosmeticId);
    const id = targetRow[context.ID];

    const updates = [];
    updates.push({
      id: id,
      action: 'insertRow',
      params: params,
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    });
    updateSets.push(updates);

    debugLog(updateSets);

    await addRow(id, insertAbove, copy);

    if (numberOfRows > 1) {
      numberOfRows--;

      await insertRow(params, insertAbove, copy, numberOfRows, updateSets);

      return true;
    } else {
      // no more inserts
      context.pushEvent(updateSets);

      console.log('down here');

      await refresh(context);
      console.log('1');
      await loading(context, false);
      console.log('2');
      return true;
    }
  } catch (err) {
    return errorHandler({err: err, context: 'insertRow', isLast: true});
  }
};

const insertRowWithData = async (params, data, numOfRecords=1) => {
  const addRowWithPartiallyCopiedData = async (id, data) => {
    try {
      const context = params.context;
      const payload = {
        id: id,
        data: data,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'addRowWithPartiallyCopiedData', payload);

      debugLog('Added Row');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'addRowWithPartiallyCopiedData'});
    }
  };

  try {
    const gridOptions = params.api.gridOptionsWrapper.gridOptions;
    const rowData = getRowData(gridOptions);
    const context = params.context;

    await loading(context, true, 'Adding Row(s)...\nPlease Wait.');

    let cosmeticId;

    // params.node will be null in the case that the user adds a row but has none
    // of the previous rows selected.
    if (params.node !== null) {
      if (params.node.data !== undefined) {
        cosmeticId = params.node.data[context.COSMETIC_ID];
      } else {
        cosmeticId = 1;
      }
    } else {
      cosmeticId = 1;
    }

    const targetRow = rowData.find((row) => row[context.COSMETIC_ID] === cosmeticId);
    const id = targetRow[context.ID];

    const updateSets = [];
    const updates = [];
    for (let i = 0; i < numOfRecords; i++) {
      updates.push({
        id: id,
        action: 'insertRow',
        params: params,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      });
    }
    updateSets.push(updates);

    debugLog(updateSets);

    for (let i = 0; i < numOfRecords; i++) {
      await addRowWithPartiallyCopiedData(id, data);
    }

    context.pushEvent(updateSets);

    await refresh(context);
    await loading(context, false);
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'insertRowWithData', isLast: true});
  }
};

const deleteRow = async (params) => {
  const removeRow = async (id) => {
    try {
      const context = params.context;
      const payload = {
        id: id,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'removeRow', payload);

      debugLog('Removed Row');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'removeRow'});
    }
  };

  try {
    if (params.node !== null) {
      const gridOptions = params.api.gridOptionsWrapper.gridOptions;
      const rangeSelections = gridOptions.api.getCellRanges();
      const context = params.context;

      const updates = [];
      const updateSets = [];

      await loading(context, true, 'Deleting Row...\nPlease Wait.');

      for (let i = 0; i < rangeSelections.length; i++) {
        const range = rangeSelections[i];
        const startRowIndex = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
        const endRowIndex = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);

        for (let i = startRowIndex; i <= endRowIndex; i++) {
          const foundData = context.gridOptions.api.getDisplayedRowAtIndex(i);
          const id = foundData.data.id;

          updates.push({
            id: id,
            action: 'deleteRow',
            params: params,
            data: foundData.data,
            gridName: context.getGridName(),
            altColumnTable: context.params.options.altColumnTable
          });

          // Now to modify the database.
          await removeRow(id);
        }
      }

      updateSets.push(updates);

      debugLog(updateSets);

      context.pushEvent(updateSets);

      await refresh(context);
      await loading(context, false);
      return true;
    } else {
      throw 'params.node === null';
    }
  } catch (err) {
    return errorHandler({err: err, context: 'deleteRow', isLast: true});
  }
};

const initializeGrid = async (params) => {
  const addColumn = async (columnName, columnIndex) => {
    try {
      const context = params.context;
      const payload = {
        columnName: columnName,
        columnIndex: columnIndex,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'addColumn', payload);

      debugLog('Added Column');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'addColumn'});
    }
  };

  const setCustomHeaderName = async (columnName, customHeaderName) => {
    try {
      const context = params.context;
      const payload = {
        columnName: columnName,
        customHeaderName: customHeaderName,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'setCustomHeaderName', payload);

      debugLog('Set Custom Header Name');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'setCustomHeaderName'});
    }
  };

  const addRow = async (id) => {
    try {
      const context = params.context;
      const payload = {
        id: id,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable,
        initialize: true
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'addRow', payload);

      debugLog('Added Row');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'addRow'});
    }
  };

  try {
    const context = params.context;

    const newName = 'new_column';

    await loading(context, true, 'Initializing Grid...\nPlease Wait.');

    // Now to modify the database.
    await addColumn(newName, 1);
    await setCustomHeaderName(newName, toTitleCase(newName.replace(/_/g, ' ')));
    await addRow(1);
    await refresh(context);

    await loading(context, false);

    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'Initialize Grid', isLast: true});
  }
};