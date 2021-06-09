import {refresh} from './grid-functions';
import {updateData,
  updateStyle,
  getRowData,
  loading,
  errorHandler,
  debugLog,
  startSnackbar,
  endSnackbar} from '../utility/utility';

async function undo(context) {
  const undoStyleAndData = async (lastEvent, gridOptions) => {
    try {
      const rowData = getRowData(gridOptions);
      let startColumn = lastEvent[0][0].colId;

      if (/styleattrib_/.test(startColumn)) startColumn = startColumn.substring(12);

      const givenRowIndex = rowData.findIndex((row) => row[context.ID] === lastEvent[0][0][context.ID]);
      // const startRowIndex = findVirtualRowIndex(context, givenRowIndex);
      const startRowIndex = givenRowIndex;

      let updates = [];
      const updateSets = [];
      const rowNodes = [];

      lastEvent.forEach((event) => {
        event.forEach((eventPart) => {
          const rowNode = gridOptions.api.getRowNode(eventPart[context.ID]);
          const updated = Object.assign({}, rowNode.data);

          updated[eventPart.colId] = eventPart.oldValue;

          rowNode.setData(updated);
          rowNodes.push(rowNode);

          if (updates.length >= 400) {
            if (updateSets[updateSets.length - 1] !== updates) {
              updateSets.push(updates);
            }

            updates = [];
            updates.push({
              id: eventPart[context.ID],
              colId: eventPart.colId,
              value: eventPart.oldValue,
              oldValue: eventPart.value,
              gridName: context.getGridName(),
              altColumnTable: context.params.options.altColumnTable
            });
          } else {
            updates.push({
              id: eventPart[context.ID],
              colId: eventPart.colId,
              value: eventPart.oldValue,
              oldValue: eventPart.value,
              gridName: context.getGridName(),
              altColumnTable: context.params.options.altColumnTable
            });
          }
        });
      });

      if (updates.length !== 0) {
        if (updateSets[updateSets.length - 1] !== updates) updateSets.push(updates);
      }

      if (updateSets.length !== 0) {
        gridOptions.api.redrawRows({rowNodes: rowNodes});
        gridOptions.api.clearRangeSelection();
        gridOptions.api.setFocusedCell(startRowIndex, startColumn);
        gridOptions.api.ensureIndexVisible(startRowIndex, 'middle');
        gridOptions.api.ensureColumnVisible(startColumn);

        if (!/styleattrib_/.test(updateSets[0][0].colId)) {
          await updateData(context, updateSets);

          await endSnackbar('Undid data.');
          debugLog('Undid Data.');
          return true;
        } else {
          await updateStyle(context, updateSets);

          await endSnackbar('Undid style(s).');
          debugLog('Undid Style(s).');
          return true;
        }
      } else {
        await endSnackbar('Nothing to undo.');
        return true;
      }
    } catch (err) {
      return errorHandler({err: err, context: 'undoStyleAndData'});
    }
  };

  const undoInsertRow = async (actionObj) => {
    const deleteRow = async (id, params) => {
      try {
        if (params.node === null) throw 'params.node === null';

        // Now to modify the database.
        const data = {
          id: id,
          gridName: context.getGridName(),
          altColumnTable: context.params.options.altColumnTable
        };

        await context.sendRequest('api/ag-grid-spreadsheet/', 'removeRow', data);

        debugLog('Removed Row');
        return true;
      } catch (err) {
        return errorHandler({err: err, context: 'deleteRow'});
      }
    };

    try {
      // This doesn't work because I'm saving the row that opened the context menu, not the one that was created.
      // await deleteRow(actionObj[context.ID], actionObj.params);

      // context.gridOptions.api.ensureIndexVisible(actionObj[context.COSMETIC_ID], 'middle');
    } catch (err) {
      return errorHandler({err: err, context: 'undoInsertRow'});
    }
  };

  const undoDeleteRow = async (actionObj, gridOptions) => {
    const insertRow = async (actionObj, side) => {
      const addRow = async (insertLocationId, replacementId) => {
        try {
          const data = {
            id: insertLocationId,
            replacementId: replacementId,
            gridName: context.getGridName(),
            altColumnTable: context.params.options.altColumnTable
          };

          await context.sendRequest('api/ag-grid-spreadsheet/', 'addRow', data);

          debugLog('Added Row');
          return true;
        } catch (err) {
          return errorHandler({err: err, context: 'addRow'});
        }
      };

      const getIdFromCosmeticId = (cosmeticId) => {
        const targetRow = rowData.find((row) => row[context.COSMETIC_ID] === cosmeticId);
        return targetRow[context.ID];
      };

      try {
        const params = actionObj.params;
        const gridOptions = params.api.gridOptionsWrapper.gridOptions;
        const rowData = getRowData(gridOptions);

        let cosmeticId;
        let replacementId;

        // params.node will be null in the case this the user adds a row but has none
        // of the previous rows selected.
        if (params.node !== null) {
          if (params.node.data !== undefined) {
            cosmeticId = params.node.data[context.COSMETIC_ID] - 1;
            replacementId = actionObj[context.ID];
          } else {
            cosmeticId = 1;
            replacementId = getIdFromCosmeticId(1);
          }
        } else {
          if (side === 'up') {
            cosmeticId = 1;
            replacementId = getIdFromCosmeticId(1);
          } else {
            cosmeticId = rowData.length;
            replacementId = getIdFromCosmeticId(rowData.length);
          }
        }

        const targetRow = rowData.find((row) => row[context.COSMETIC_ID] === cosmeticId);
        const insertLocationId = targetRow[context.ID];

        await addRow(insertLocationId, replacementId);

        return true;
      } catch (err) {
        return errorHandler({err: err, context: 'insertRow'});
      }
    };

    try {
      await insertRow(actionObj);

      // Add back data that was in row
      for (const [key, value] of Object.entries(actionObj.data)) {
        if (key !== context.COSMETIC_ID && key !== context.ID) {
          const columnDefs = actionObj.params.node.gridOptionsWrapper.gridOptions.columnDefs;

          const found = columnDefs.findIndex((columnDef) => key === columnDef.field);
          if (found > -1 &&
              actionObj.data[key] !== '' &&
              !/styleattrib_/.test(key)) {
            context.pushUpdates(parseInt(actionObj[context.ID]), key, actionObj.data[key], '');
          }
        }
      }

      await context.sendUpdatesButDontAppendToEvents();

      // Add back style that was in row
      for (const [key, value] of Object.entries(actionObj.data)) {
        if (key !== context.COSMETIC_ID && key !== context.ID &&
          actionObj.data[key] !== '' &&
            /styleattrib_/.test(key)) {
          context.pushUpdates(parseInt(actionObj[context.ID]), key, actionObj.data[key], '');
        }
      }

      await context.sendUpdatesButDontAppendToEvents();

      gridOptions.api.ensureIndexVisible(actionObj[context.COSMETIC_ID], 'middle');
    } catch (err) {
      return errorHandler({err: err, context: 'undoDeleteRow'});
    }
  };

  const undoInsertColumn = async (actionObj) => {
    try {
      const data = {
        columnName: actionObj.columnName,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'removeColumn', data);

      debugLog('Removed Column');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'undoInsertColumn'});
    }
  };

  const undoDeleteColumn = async (actionObj) => {
    const insertColumn = async (params) => {
      const generateNewColumn = (name, customName) => {
        const objectString = '{"headerName": "' + customName +
                            '", "field": "' + name +
                            '", "hide": false}';

        return JSON.parse(objectString);
      };

      const addColumn = async (columnName, columnIndex) => {
        try {
          const data = {
            columnName: columnName,
            columnIndex: columnIndex,
            gridName: context.getGridName(),
            altColumnTable: context.params.options.altColumnTable
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

      const hideColumnPoster = async (columnName, hide) => {
        try {
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

      const pinColumnsPoster = async (columns, pinned) => {
        try {
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

      const setColumnWidth = async (colId, width) => {
        try {
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
        const gridOptions = params.gridOptions;

        await startSnackbar('Adding Column(s)...\nPlease Wait.');

        const columnIndex = params.columnIndex;
        const name = params.columnDef.field;
        const customName = params.columnDef.headerName;

        let hide;
        let pinned;
        let width;

        if (params.columnDef.hide) {
          hide = params.columnDef.hide;
        } else {
          hide = false;
        }

        if (params.columnDef.pinned) {
          pinned = params.columnDef.pinned;
        } else {
          pinned = '';
        }

        if (params.columnDef.width) {
          width = params.columnDef.width;
        } else {
          width = null;
        }

        const newColumn = generateNewColumn(name, customName);

        // extend array
        gridOptions.columnDefs.push({
          headerName: null,
          field: null,
          hide: false
        });

        for (let j = gridOptions.columnDefs.length - 1; j > columnIndex; j--) {
          gridOptions.columnDefs[j] = JSON.parse(JSON.stringify(gridOptions.columnDefs[j - 1]));
        }

        gridOptions.columnDefs[columnIndex] = newColumn;

        // Now to modify the database.
        await addColumn(name, columnIndex);
        await setCustomHeaderName(name, customName);

        // hide column if hidden columns are collapsed, otherwise keep it visible.
        let columns = gridOptions.columnApi.getAllColumns();

        const collapsed = columns.find((col) => {
          return col.visible === false;
        });

        if (collapsed) gridOptions.columnApi.setColumnVisible(name, !hide);

        // change hide value in columnDefs
        gridOptions.columnDefs[columnIndex].hide = hide;

        // change hide value in database
        await hideColumnPoster(name, hide);

        columns = [];

        gridOptions.columnDefs[columnIndex].pinned = pinned;
        columns.push(gridOptions.columnDefs[columnIndex].field);

        await pinColumnsPoster(columns, pinned);

        // for some reason not having this if statement causes
        // the column to be set to wider than normal.
        if (width !== null) gridOptions.columnDefs[columnIndex].width = width;

        await setColumnWidth(name, width);

        return true;
      } catch (err) {
        return errorHandler({err: err, context: 'insertColumn'});
      }
    };

    try {
      await insertColumn(actionObj);

      // add the old data back in
      let key = actionObj.columnDef.field;
      actionObj.rowData.forEach((data) => {
        if (data[key] !== '') {
          context.pushUpdates(parseInt(data[context.ID]), key, data[key], '');
        }
      });

      await context.sendUpdatesButDontAppendToEvents();

      // add the old styles back in.
      key = 'styleattrib_' + actionObj.columnDef.field;
      actionObj.rowData.forEach((data) => {
        if (data[key] !== '') {
          context.pushUpdates(parseInt(data[context.ID]), key, data[key], '');
        }
      });

      await context.sendUpdatesButDontAppendToEvents();

      if (!actionObj.columnDef.hide && actionObj.columnDef.pinned === '') {
        actionObj.gridOptions.api.ensureColumnVisible(actionObj.columnDef.field);
      }
    } catch (err) {
      return errorHandler({err: err, context: 'undoDeleteColumn'});
    }
  };

  const undoHideOrUnhideColumn = async (actionObj, gridOptions) => {
    const hideColumnPoster = async (columnName, hide) => {
      try {
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

    try {
      // hide column if hidden columns are collapsed, otherwise keep it visible.
      const columns = gridOptions.columnApi.getAllColumns();

      const collapsed = columns.find((col) => {
        return col.visible === false;
      });

      if (collapsed) {
        gridOptions.columnApi.setColumnVisible(gridOptions.columnDefs[actionObj.columnIndex].field, !actionObj.hide);
      }

      // change hide value in columnDefs
      gridOptions.columnDefs[actionObj.columnIndex].hide = !actionObj.hide;

      // change hide value in database
      await hideColumnPoster(gridOptions.columnDefs[actionObj.columnIndex].field, !actionObj.hide);
      await context.setColumnTable();
    } catch (err) {
      return errorHandler({err: err, context: 'undoHideOrUnhideColumn'});
    }
  };

  const undoForceProperty = async (actionObj, gridOptions) => {
    const forcePropertyPoster = async (property, force, columnName) => {
      try {
        const data = {
          property: property,
          force: force,
          gridName: context.getGridName(),
          altColumnTable: context.params.options.altColumnTable,
          columnName: columnName
        };

        await context.sendRequest('api/ag-grid-spreadsheet/', 'forceProperty', data);

        debugLog((force ? 'Force ':'Unforce ') + property);
        return true;
      } catch (err) {
        return errorHandler({err: err, context: 'forcePropertyPoster'});
      }
    };

    try {
      const property = actionObj.property;

      gridOptions.columnDefs[actionObj.columnIndex][property.toLowerCase()] = !actionObj[property];

      await forcePropertyPoster(property, !actionObj.force, gridOptions.columnDefs[actionObj.columnIndex].field);
      await context.setColumnTable();
    } catch (err) {
      return errorHandler({err: err, context: 'undoForceProperty'});
    }
  };

  const undoRenameColumn = async (actionObj, gridOptions) => {
    const renameColumn = async (oldColumn, newColumn) => {
      try {
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
      const originalName = actionObj.oldHeaderName;
      const newField = actionObj.oldField;
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

      if (!duplicate) {
        gridOptions.columnDefs[actionObj.columnIndex].headerName = originalName;
        gridOptions.columnDefs[actionObj.columnIndex].field = newField;
      }

      await renameColumn(actionObj.newField, newField);
      await setCustomHeaderName(newField, originalName);
      await context.setColumnTable();
    } catch (err) {
      return errorHandler({err: err, context: 'undoRenameColumn'});
    }
  };

  const undoChangeColumnWidth = async (actionObj, gridOptions) => {
    const setColumnWidth = async (colId, width) => {
      try {
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
      const columnDefs = gridOptions.columnDefs;
      const width = actionObj.oldWidth;

      await setColumnWidth(actionObj.field, width);

      columnDefs[actionObj.columnIndex].width = parseInt(width);
      await context.setColumnTable();
    } catch (err) {
      return errorHandler({err: err, context: 'undoChangeColumnWidth'});
    }
  };

  const undoChangeHorizontalFormula = async (actionObj) => {
    try {
      const data = {
        colId: actionObj.field,
        formula: actionObj.oldFormula,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'setHorizontalFormula', data);

      debugLog('Set Horizontal Formula');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'undoChangeHorizontalFormula'});
    }
  };

  const undoCopyFormulaDownColumn = async (actionObj) => {
    try {
      const data = {
        colId: actionObj.columnDef.field,
        rowData: actionObj.rowData,
        gridName: context.getGridName(),
        altColumnTable: context.params.options.altColumnTable
      };

      await context.sendRequest('api/ag-grid-spreadsheet/', 'setColumnData', data);

      debugLog('Set Column Data');
      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'undoCopyFormulaDownColumn'});
    }
  };

  try {
    const gridOptions = context.gridOptions;
    const events = context.events;

    console.log('events');
    console.log(events);

    if (events.length !== 0) {
      let cont = true;

      // if (events[events.length - 1][0][0].action === 'deleteColumn') {
      //   cont = confirm('Undo-ing a column deletion may take several minutes. If you exit the window or do anything else before the operation is finished it could lead to missing data. Do you wish to continue?');
      // }

      if (cont) {
        const lastEvent = events.pop();

        await startSnackbar('Undo-ing...\nPlease wait.');

        if (lastEvent[0][0].colId !== undefined) {
          await loading(context, true, `Undoing data/style change...\nPlease Wait.`);
          await undoStyleAndData(lastEvent, gridOptions);
        } else {
          for (let i = 0; i < lastEvent.length; i++) {
            const eventPart = lastEvent[i];

            for (let j = 0; j < eventPart.length; j++) {
              const actionObj = eventPart[j];

              await loading(context, true, `Undoing ${actionObj.action}...\nPlease Wait.`);

              if (actionObj.action === 'insertRow') {
                // await undoInsertRow(actionObj);
                await loading(context, false, `Undoing row inserts doesn't work currently, skipping event.`);
                return true;
              } else if (actionObj.action === 'deleteRow') {
                await undoDeleteRow(actionObj, gridOptions);
                refresh(context);
              } else if (actionObj.action === 'insertColumn') {
                await undoInsertColumn(actionObj);
                refresh(context);
              } else if (actionObj.action === 'deleteColumn') {
                // await undoDeleteColumn(actionObj);
                await loading(context, false, `Undoing column deletes doesn't work currently, skipping event.`);
                return true;
              } else if (actionObj.action === 'hideOrUnhideColumn') {
                await undoHideOrUnhideColumn(actionObj, gridOptions);
                refresh(context);
              } else if (/force/.test(actionObj.action)) {
                await undoForceProperty(actionObj, gridOptions);
                refresh(context);
              } else if (actionObj.action === 'renameColumn') {
                await undoRenameColumn(actionObj, gridOptions);
                refresh(context);
              } else if (actionObj.action === 'changeColumnWidth') {
                await undoChangeColumnWidth(actionObj, gridOptions);
                refresh(context);
              } else if (actionObj.action === 'changeHorizontalFormula') {
                await undoChangeHorizontalFormula(actionObj);
                refresh(context);
              } else if (actionObj.action === 'copyFormulaDownColumn') {
                await undoCopyFormulaDownColumn(actionObj);
                refresh(context);
              } else {
                await loading(context, false, `Action didn't match in list. This shouldn't happen.`);
              }
            }
          }

          // refresh(context);
        }

        await loading(context, false);
        return true;
      } else {
        await startSnackbar('Canceled undo');
        await endSnackbar('Canceled undo');
        return true;
      }
    } else {
      await startSnackbar('Nothing to undo');
      await endSnackbar('Nothing to undo');
      return true;
    }
  } catch (err) {
    await endSnackbar('Error in undo');
    return errorHandler({err: err, context: 'undo', isLast: true});
  }
}

export {
  undo
};