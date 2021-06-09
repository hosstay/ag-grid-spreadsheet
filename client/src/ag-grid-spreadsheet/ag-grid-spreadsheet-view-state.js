import {gridSetup} from './setup/grid-setup';
import {updateData,
  updateStyle,
  getDBColumnTable,
  getDataTablesSchema,
  errorHandler,
  errorSnackbarHandler,
  debugLog,
  quickSnackbar,
  timeoutPromise} from './utility/utility';

export class AgGridSpreadsheetViewState {
  constructor(params, dataLoader) {
    this.params = params;
    if (!this.params.options) this.params.options = {};
    this.gridName = params.gridName;
    this.additionalData = params.additionalData;
    this.dataLoader = dataLoader;

    this.gridOptions;
    this.grid;
    this.gridType;

    this.ID = 'id';
    this.COSMETIC_ID = 'grid_specific_id';

    /* element ids */
    // general
    this.outerView = 'tracking-view';
    this.innerView = 'sheet';
    this.headerBar = 'header-bar';
    this.gridDiv = 'ag-grid-spreadsheet';
    this.snackbar = 'saved-snackbar';
    this.clickBlocker = 'click-blocker';

    // bottom bar
    this.formulaBar = 'formula-bar';
    this.sumLabel = 'sum-label';

    // for bottom and top bar events
    this.keyPressEventListener;
    this.formulaBarEventListener;

    this.filterPattern = '';
    this.searchColumnPattern = '';
    this.lastSearchColumn = null;

    // used to make sure each update goes through in turn
    this.busy = false;

    // keep track of updates
    this.updateSets = [];
    this.updates = [];
    this.prevSentUpdates = [];
    this.start = [];

    // keep track of events for undo
    this.events = [];

    this.lastRow = 0;

    this.columnTable = [];

    // keeps track of copy information for incrementing formulas on paste.
    this.copyInformation = [];
    this.lastCopyInformation = [];
    this.inPaste = false;
    this.copiedSinceLastPaste = false;

    // keeps track of users clicks while editing so that the user can use the
    // arrow keys to navigate even while editing, but if the user clicks again
    // within the editing box, it allows arrow keys to move between characters.
    this.clickedEdit = false;

    // keeps track of grouping agg calculations
    this.groupAggs = [];

    // keeps track of opened groupings
    this.expandedGroups = [];

    // keeps track of whether or not server-side datasource is loading in new records.
    this.loading = false;
    // keeps track of cell that was focused before blurred during loading
    this.loadingCellFocused;

    // keeps track of the original rowgroup and rowGroupFilter so when the filter is toggled off it can be
    // toggled back on again.
    this.rowGroup = [];
    this.rowGroupFilter = [];
    if (this.params.options.rowGroup) {
      this.rowGroup = this.params.options.rowGroup;
    }

    if (this.params.options.rowGroupFilter) {
      this.rowGroupFilter = this.params.options.rowGroupFilter;
    }
    this.combinedRowGroup = JSON.parse(JSON.stringify(this.rowGroup));
    this.rowGroupFilter.forEach((filter) =>{
      this.combinedRowGroup.push(filter);
    });
  }

  gridSetup() {
    gridSetup(this);
  }

  setLoadingSpinner(bool) {
    // loading message logic here
  }

  onModelUpdated() {
  }

  /* Data Update Functions */

  async sendRequest(prefix, endpoint, payload = {}) {
    try {
      if (!this.busy) {
        this.busy = true;

        debugLog(payload);

        let response = await this.dataLoader.httpFetch({
          prefix: prefix,
          db: this.params.options.db ? this.params.options.db : 'mdx',
          endpoint: endpoint,
          payload: {
            data: payload,
            changeLog: this.params.options.changeLog ? this.params.options.changeLog : false
          }
        });

        this.busy = false;

        if (response.message) {
          await quickSnackbar(response.message, 10000);
        }

        if (response.result) {
          response = response.result;
        }

        return response;
      } else {
        await timeoutPromise(100);

        const result = await this.sendRequest(prefix, endpoint, payload);

        return result;
      }
    } catch (err) {
      await errorSnackbarHandler(err, this);
      return errorHandler({err: err, context: 'sendRequest @ ' + prefix + endpoint});
    }
  }

  pushUpdates(id, colId, newValue, oldValue) {
    if (this.updates.length >= 400) {
      if (this.updateSets[this.updateSets.length - 1] !== this.updates) this.updateSets.push(this.updates);

      this.updates = [];
      this.updates.push({
        id: id,
        colId: colId,
        value: newValue,
        oldValue: oldValue,
        gridName: this.gridName,
        altColumnTable: this.params.options.altColumnTable
      });
    } else {
      this.updates.push({
        id: id,
        colId: colId,
        value: newValue,
        oldValue: oldValue,
        gridName: this.gridName,
        altColumnTable: this.params.options.altColumnTable
      });
    }
  }

  async pushUpdatesAndSendWhenStops(id, colId, newValue, oldValue) {
    try {
      if (this.updates.length >= 400) {
        if (this.updateSets[this.updateSets.length - 1] !== this.updates) this.updateSets.push(this.updates);

        this.updates = [];
        this.updates.push({
          id: id,
          colId: colId,
          value: newValue,
          oldValue: oldValue,
          gridName: this.gridName,
          altColumnTable: this.params.options.altColumnTable
        });
      } else {
        this.updates.push({
          id: id,
          colId: colId,
          value: newValue,
          oldValue: oldValue,
          gridName: this.gridName,
          altColumnTable: this.params.options.altColumnTable
        });
      }

      this.start = new Date();

      await timeoutPromise(1050);

      const end = new Date();

      if (this.updateSets.length > 0 || this.updates.length > 0) {
        if (end - this.start >= 1000) {
          if (typeof newValue === 'string' && /^=/.test(newValue)) {
            await this.sendUpdates(true);
          } else {
            await this.sendUpdates();
          }
        } else {
          return true;
        }
      } else {
        return true;
      }

      return true;
    } catch (err) {
      return errorHandler({err: err, context: 'pushUpdatesAndSendWhenStops'});
    }
  }

  pushEvent(updateSets) {
    if (updateSets.length !== 0) {
      this.events.push(updateSets);

      debugLog('this.events');
      debugLog(this.events);
    }
  }

  async sendUpdates(needsRefresh = false) {
    try {
      if (this.updates.length !== 0) {
        if (this.updateSets[this.updateSets.length - 1] !== this.updates) this.updateSets.push(this.updates);
      }

      if (this.prevSentUpdates === [] || this.updateSets !== this.prevSentUpdates) {
        this.prevSentUpdates = this.updateSets;

        if (this.updateSets[0] && !/styleattrib_/.test(this.updateSets[0][0].colId)) {
          const data = this.updateSets;
          this.updateSets = [];
          this.updates = [];

          await updateData(this, data, 0, needsRefresh);

          if (data.length !== 0) this.events.push(data);

          return true;
        } else {
          const data = this.updateSets;
          this.updateSets = [];
          this.updates = [];

          await updateStyle(this, data);

          if (data.length !== 0) this.events.push(data);

          return true;
        }
      } else {
        return true;
      }
    } catch (err) {
      return errorHandler({err: err, context: 'sendUpdates'});
    }
  }

  async sendUpdatesButDontAppendToEvents() {
    try {
      if (this.updates.length !== 0) {
        if (this.updateSets[this.updateSets.length - 1] !== this.updates) this.updateSets.push(this.updates);
      }

      if (this.updateSets.length !== 0) {
        if (!/styleattrib_/.test(this.updateSets[0][0].colId)) {
          await updateData(this, this.updateSets);

          this.updateSets = [];
          this.updates = [];
          return true;
        } else {
          await updateStyle(this, this.updateSets);

          this.updateSets = [];
          this.updates = [];
          return true;
        }
      } else {
        return true;
      }
    } catch (err) {
      return errorHandler({err: err, context: 'sendUpdatesButDontAppendToEvents'});
    }
  }

  /* Misc Functions */

  async setColumnTable(columnTable) {
    try {
      if (columnTable !== undefined) {
        this.columnTable = columnTable;
        return true;
      } else {
        this.columnTable = await getDBColumnTable(this);
        return true;
      }
    } catch (err) {
      return errorHandler({err: err, context: 'setColumnTable'});
    }
  }

  getColumnTable() {
    return this.columnTable;
  }

  setSchemaTable(schemaTable) {
    this.schemaTable = schemaTable;
  }

  async getSchemaTable() {
    if (this.schemaTable) return this.schemaTable;

    const schemaTable = await getDataTablesSchema(this);
    this.setSchemaTable(schemaTable);

    return this.schemaTable;
  }

  getGridName() {
    return this.gridName;
  }

  getAdditionalData() {
    return this.additionalData;
  }

  getDefaultSort() {
    return this.params.options.defaultSort;
  }

  getFilter() {
    return this.params.options.filter;
  }

  setCopyInformation(copyColumn, copyRow, copyCosmeticId) {
    this.copyInformation.push({
      copyColumn: copyColumn,
      copyRow: copyRow,
      copyCosmeticId: copyCosmeticId
    });
    this.copiedSinceLastPaste = true;
  }

  getCopyInformation() {
    if (this.copyInformation.length !== 0 || this.lastCopyInformation.length !== 0) {
      let info;

      if (!this.inPaste) {
        if (this.copiedSinceLastPaste) {
          this.lastCopyInformation = JSON.parse(JSON.stringify(this.copyInformation));
        } else {
          this.copyInformation = JSON.parse(JSON.stringify(this.lastCopyInformation));
        }

        this.inPaste = true;

        info = this.copyInformation.shift();

        if (this.copyInformation.length === 0) {
          this.inPaste = false;
        }
      } else {
        info = this.copyInformation.shift();

        if (this.copyInformation.length === 0) {
          this.inPaste = false;
        }
      }

      this.copiedSinceLastPaste = false;

      return info;
    } else {
      return false;
    }
  }

  setClickedEdit(bool) {
    this.clickedEdit = bool;
  }

  getClickedEdit() {
    return this.clickedEdit;
  }

  pushAgg(obj, agg) {
    // finds an obj that is the same for all but aggValue
    const findSimilarObjInArr = (obj, arr) => {
      function isEquivExceptAggValue(a, b) {
        const aProps = Object.getOwnPropertyNames(a);
        const bProps = Object.getOwnPropertyNames(b);

        if (aProps.length != bProps.length) {
          return false;
        }

        for (let i = 0; i < aProps.length; i++) {
          const propName = aProps[i];

          if (propName !== 'aggValue') {
            if (a[propName] !== b[propName]) {
              return false;
            }
          }
        }

        return true;
      }

      let index = -1;

      for (let i = 0; i < arr.length; i++) {
        if (arr[i] !== undefined) {
          if (isEquivExceptAggValue(obj, arr[i])) {
            index = i;
            break;
          }
        } else {
          console.log('undefined skipping');
        }
      }

      if (index === -1) {
        console.log(`didn't find matching object`);
      }

      return index;
    };

    let foundName = false;

    for (const i in this.groupAggs) {
      if (this.groupAggs[i].name === agg) {
        foundName = true;

        if (findSimilarObjInArr(obj, this.groupAggs[i].agg) === -1) {
          this.groupAggs[i].agg.push(obj);
        }
      }
    }

    if (!foundName) {
      this.groupAggs.push({
        name: agg,
        agg: [obj]
      });
    }
  }

  getGroupAgg(agg) {
    for (const i in this.groupAggs) {
      if (this.groupAggs[i].name === agg) {
        groupAgg = this.groupAggs[i].agg;
      }
    }

    if (!groupAgg) {
      groupAgg = [];
    }

    return groupAgg;
  }

  getGroupNode(group) {
    let groupNode;

    this.gridOptions.api.forEachNode((node) => {
      if (node.data !== undefined && group.firm === node.data.firm && group.year === node.data.year && group.month === node.data.month && node.expanded !== undefined) {
        groupNode = node;
      }
    });

    return groupNode;
  }

  setLoading(loading) {
    this.loading = loading;
  }

  getLoading(context) {
    console.log('meme');
    if (context) {
      return context.loading;
    } else {
      return this.loading;
    }
  }

  getExpandedGroups(fullExpansionLength) {
    const removeNonFullyExpandedGroups = () => {
      const cntObj = {};

      // find full expansions
      this.expandedGroups.forEach((item) => {
        if (cntObj[item.firm] === undefined) {
          cntObj[item.firm] = 1;
        } else {
          cntObj[item.firm]++;
        }
      });

      // remove non-full expansions
      return this.expandedGroups.filter((expansion) => {
        return cntObj[expansion.firm] === fullExpansionLength;
      });
    };

    const sortExpansions = (level, resultArr, expansionIndex) => {
      const expansion = resultArr[expansionIndex];
      if (expansion.level === level) {
        const previousExpansion = resultArr[expansionIndex - 1];
        const aboveIsSameFirm = previousExpansion && previousExpansion.firm === expansion.firm;
        const aboveIsPreviousLevel = previousExpansion && previousExpansion.level === expansion.level - 1;
        if (!aboveIsSameFirm || !aboveIsPreviousLevel) {
          resultArr.splice(expansionIndex, 1);

          for (let j = 0; j < resultArr.length; j++) {
            const foundSameFirm = resultArr[j].firm === expansion.firm;
            const foundPreviousLevel = resultArr[j].level === expansion.level - 1;
            if (foundSameFirm && foundPreviousLevel) {
              resultArr.splice(j + 1, 0, expansion);
              break;
            }
          }
        }
      }

      return expansionIndex;
    };

    const fullyExpandedGroups = removeNonFullyExpandedGroups();

    for (let i = 2; i < fullExpansionLength; i++) {
      for (let j = 0; j < fullyExpandedGroups.length; j++) {
        j = sortExpansions(i, fullyExpandedGroups, j);
      }
    }

    return fullyExpandedGroups;
  }

  getExpandedGroupsAndCullHiddenSecondaryGroupings(fullExpansionLength) {
    const removeNonFullyExpandedGroupsPermanantly = () => {
      const cntObj = {};

      // find full expansions
      this.expandedGroups.forEach((item) => {
        if (cntObj[item.firm] === undefined) {
          cntObj[item.firm] = 1;
        } else {
          cntObj[item.firm]++;
        }
      });

      // remove non-full expansions
      this.expandedGroups = this.expandedGroups.filter((expansion) => {
        return cntObj[expansion.firm] === fullExpansionLength;
      });
    };

    const expandedGroups = this.getExpandedGroups(fullExpansionLength);

    removeNonFullyExpandedGroupsPermanantly();

    return expandedGroups;
  }

  resetExpandedGroups() {
    this.expandedGroups = [];
  }
}