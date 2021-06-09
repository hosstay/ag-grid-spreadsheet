// handles the case where the user wants to select a row by clicking on context.COSMETIC_ID.
export function handleRowSelect(params, gridOptions) {
  const firstNonHiddenColumn = gridOptions.columnDefs.find((columnDef) => {
    return columnDef.field !== gridOptions.context.COSMETIC_ID && columnDef.field !== gridOptions.context.ID && gridOptions.columnApi.getColumn(columnDef.field).visible;
  });

  // add range from first visible column to last column
  if (params.colDef.field === gridOptions.context.COSMETIC_ID) {
    gridOptions.api.addCellRange({
      rowStartIndex: params.node.rowIndex,
      rowEndIndex: params.node.rowIndex,
      columnStart: firstNonHiddenColumn.field,
      columnEnd: gridOptions.columnDefs[gridOptions.columnDefs.length - 1].field
    });
  }
}

export function singleCellClick(params, gridOptions) {
  if (!params.event.ctrlKey) {
    // remove any column selection highlighting.
    const columns = params.columnApi.getAllDisplayedVirtualColumns();
    columns.forEach((column) => {
      const element = document.querySelector('div[col-id=' + column.colId + ']');
      element.classList.remove('header-selected');
    });
  }

  // remove any context.COSMETIC_ID selections.
  const rangeSelections = gridOptions.api.getCellRanges();
  for (let i = 0; i < rangeSelections.length; i++) {
    if (rangeSelections[i].startColumn.colId === gridOptions.context.COSMETIC_ID) {
      rangeSelections.splice(i, 1);
    }
  }
}