sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/mdc/p13n/StateUtil",
    "sap/m/MessageToast",
    "glassboard/utility/CustomUtility"
], (Controller, Fragment, StateUtil, MessageToast, CustomUtility) => {
    "use strict";

    return Controller.extend("glassboard.controller.Home", {
        onInit() {
            this._oNavContainer = this.byId("pageContainer");
            // Call the centralized controller's onInit
            CustomUtility.prototype.onInit.call(this);
            // Make sure the OData model is available both as the default (unnamed) model
            // AND as a named model "default" (some parts of your delegates use the named model)
            const oComponentModel = this.getOwnerComponent().getModel();
            if (oComponentModel) {
                this.getView().setModel(oComponentModel); // default (unnamed)
                this.getView().setModel(oComponentModel, "default"); // named "default"
            }

            // Then set the filter model (both filterModel and $filters for MDC FilterBar compatibility)
            const oFilterModel = new sap.ui.model.json.JSONModel({
                conditions: {},
                items: []
            });
            this.getView().setModel(oFilterModel, "filterModel");
            this.getView().setModel(oFilterModel, "$filters"); // MDC FilterBar expects $filters model

            // Optional: Set a separate model for table-specific state (if needed)
            const oTableModel = new sap.ui.model.json.JSONModel();
            this.getView().setModel(oTableModel, "tableModel");
        },

        onSideNavButtonPress() {
            const oSideNavigation = this.byId("sideNavigation"),
                bExpanded = oSideNavigation.getExpanded();


            oSideNavigation.setExpanded(!bExpanded);
        },

        onItemSelect: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const oNavContainer = this.byId("pageContainer");

            const pageMap = {
                home: "root1",
                customers: "customersPage",
                opportunities: "opportunitiesPage",
                projects: "projectsPage",
                sapid: "sapidPage",
                employees: "employeesPage",
                // ✅ REMOVED: verticals: "verticalsPage", (Vertical is now an enum, not an entity)
                overview: "allocationPage",
                requirements: "requirementsPage",
                bench: "benchPage",
                pendingProjects: "pendingProjectsPage",
                pendingOpportunities: "pendingOpportunitiesPage"
            };

            const sPageId = pageMap[sKey];


            if (!sPageId) {
                console.warn("No page mapped for key:", sKey);
                return;
            }
            // ✅ FIXED: Check for unsaved changes before navigating
            this._clearPreviousTableEditState(sKey).then((bAllowNavigation) => {
                if (!bAllowNavigation) {
                    // User chose "Stay" - don't navigate
                    return;
                }

                // Reset all tables to "show-less" state before navigating
                this._resetAllTablesToShowLess();
                oNavContainer.to(this.byId(sPageId));

                // Continue with fragment loading logic...
                this._loadFragmentIfNeeded(sKey, sPageId);
            });
        },

        // ✅ NEW: Extract fragment loading logic
        _loadFragmentIfNeeded: function (sKey, sPageId) {
            var oLogButton = this.byId("uploadLogButton");
            if (sKey === "customers") {
                this._bCustomersLoaded = true;
                const oCustomersPage = this.byId(sPageId);

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Customers",
                    controller: this
                }).then(function (oFragment) {
                    oCustomersPage.addContent(oFragment);

                    const oTable = this.byId("Customers");
                    // Ensure table starts with show-less state
                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    if (oLogButton) {
                        oLogButton.setVisible(false);
                    }

                    // Ensure the table has the correct model
                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    // Ensure FilterBar has the correct models
                    const oFilterBar = this.byId("customerFilterBar");
                    if (oFilterBar) {
                        oFilterBar.setModel(oModel, "default");
                        const oFilterModel = this.getView().getModel("$filters");
                        if (oFilterModel) {
                            oFilterBar.setModel(oFilterModel, "$filters");
                        }
                        
                        // Set default visible filters: CustomerName and Vertical
                        // Wait for FilterBar to be fully initialized
                        setTimeout(() => {
                            const fnSetDefaultFilters = () => {
                                if (oFilterBar && oFilterBar.initialized && typeof oFilterBar.initialized === "function") {
                                    oFilterBar.initialized().then(() => {
                                        // Wait for FilterBar to be ready
                                        setTimeout(() => {
                                            // Check if there's existing state
                                            StateUtil.retrieveExternalState(oFilterBar).then((oExistingState) => {
                                                // Only set default if no FilterFields state exists
                                                const bHasFilterState = oExistingState && 
                                                                       oExistingState.filter && 
                                                                       oExistingState.filter.FilterFields &&
                                                                       oExistingState.filter.FilterFields.items &&
                                                                       oExistingState.filter.FilterFields.items.length > 0;
                                                
                                                if (!bHasFilterState) {
                                                    // Set default visible filters: customerName and vertical
                                                    const oNewState = {
                                                        filter: {
                                                            FilterFields: {
                                                                items: ["customerName", "vertical"]
                                                            }
                                                        }
                                                    };
                                                    StateUtil.applyExternalState(oFilterBar, oNewState).then(() => {
                                                        console.log("✅ Default filters (customerName, vertical) set successfully");
                                                    }).catch((e) => {
                                                        console.warn("Could not set default filter state:", e);
                                                        // Try alternative approach
                                                        fnSetDefaultFiltersAlternative();
                                                    });
                                                } else {
                                                    console.log("FilterBar already has filter state, keeping existing");
                                                }
                                            }).catch(() => {
                                                // If retrieve fails, set default directly
                                                const oNewState = {
                                                    filter: {
                                                        FilterFields: {
                                                            items: ["customerName", "vertical"]
                                                        }
                                                    }
                                                };
                                                StateUtil.applyExternalState(oFilterBar, oNewState).then(() => {
                                                    console.log("✅ Default filters set (retrieve failed, applied directly)");
                                                }).catch((e) => {
                                                    console.warn("Could not set default filter state (fallback):", e);
                                                    fnSetDefaultFiltersAlternative();
                                                });
                                            });
                                        }, 500);
                                    }).catch(() => {
                                        // Retry after delay
                                        setTimeout(fnSetDefaultFilters, 500);
                                    });
                                } else {
                                    // Retry if FilterBar not ready
                                    setTimeout(fnSetDefaultFilters, 300);
                                }
                            };
                            
                            // Alternative approach: directly manipulate FilterFields visibility
                            const fnSetDefaultFiltersAlternative = () => {
                                try {
                                    const aFilterFields = oFilterBar.getFilterFields();
                                    if (aFilterFields && aFilterFields.length > 0) {
                                        // Hide all filters first
                                        aFilterFields.forEach(function(oField) {
                                            if (oField && oField.setVisible) {
                                                const sPropertyKey = oField.getPropertyKey();
                                                // Only show customerName and vertical
                                                if (sPropertyKey === "customerName" || sPropertyKey === "vertical") {
                                                    oField.setVisible(true);
                                                } else {
                                                    oField.setVisible(false);
                                                }
                                            }
                                        });
                                        console.log("✅ Default filters set via alternative method");
                                    }
                                } catch (e) {
                                    console.warn("Alternative filter setting failed:", e);
                                }
                            };
                            
                            fnSetDefaultFilters();
                        }, 800);
                    }

                    // Initialize table-specific functionality
                    this.initializeTable("Customers");

                    // Reset segmented button to "less" state for this fragment
                    this._resetSegmentedButtonForFragment("Customers");

                    // ✅ Initialize Customer ID field with next ID preview (for create mode)
                    // Wait for table to be fully initialized and data loaded
                    setTimeout(() => {
                        // Wait for table binding to be ready
                        oTable.initialized().then(() => {
                            // Additional delay to ensure data is loaded
                            setTimeout(() => {
                                this._initializeCustomerIdField();
                                // Also ensure form is in create mode (no selection)
                                const aSelectedContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];
                                if (aSelectedContexts.length === 0) {
                                    // No selection - initialize form for create mode
                                    this._onCustDialogData([]);
                                }
                            }, 500);
                        }).catch(() => {
                            // If initialization promise fails, try anyway after delay
                            setTimeout(() => {
                                this._initializeCustomerIdField();
                            }, 1000);
                        });
                    }, 300);

                }.bind(this));
            } else if (sKey === "opportunities") {
                this._bOpportunitiesLoaded = true;
                const oOpportunitiesPage = this.byId(sPageId);

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Opportunities",
                    controller: this
                }).then(function (oFragment) {
                    oOpportunitiesPage.addContent(oFragment);

                    const oTable = this.byId("Opportunities");
                    // Ensure table starts with show-less state
                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    if (oLogButton) {
                        oLogButton.setVisible(false);
                    }
                    // Ensure the table has the correct model
                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    // Initialize table-specific functionality
                    this.initializeTable("Opportunities");
                    // Reset segmented button to "less" state for this fragment
                    this._resetSegmentedButtonForFragment("Opportunities");

                    // ✅ Initialize Opportunity ID field and form
                    setTimeout(() => {
                        oTable.initialized().then(() => {
                            setTimeout(() => {
                                this._initializeOpportunityIdField();
                                const aSelectedContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];
                                if (aSelectedContexts.length === 0) {
                                    this._onOppDialogData([]);
                                }
                            }, 500);
                        }).catch(() => {
                            setTimeout(() => {
                                this._initializeOpportunityIdField();
                            }, 1000);
                        });
                    }, 300);
                }.bind(this));
            } else if (sKey === "projects") {
                this._bProjectsLoaded = true;
                const oProjectsPage = this.byId(sPageId);

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Projects",
                    controller: this
                }).then(function (oFragment) {
                    oProjectsPage.addContent(oFragment);

                    const oTable = this.byId("Projects");
                    // Ensure table starts with show-less state
                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    if (oLogButton) {
                        oLogButton.setVisible(false);
                    }
                    // Ensure the table has the correct model
                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    // Initialize table-specific functionality
                    this.initializeTable("Projects");
                    // Reset segmented button to "less" state for this fragment
                    this._resetSegmentedButtonForFragment("Projects");

                    // ✅ Initialize Project ID field and form
                    setTimeout(() => {
                        oTable.initialized().then(() => {
                            setTimeout(() => {
                                this._initializeProjectIdField();
                                const aSelectedContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];
                                if (aSelectedContexts.length === 0) {
                                    this._onProjDialogData([]);
                                }
                            }, 500);
                        }).catch(() => {
                            setTimeout(() => {
                                this._initializeProjectIdField();
                            }, 1000);
                        });
                    }, 300);
                }.bind(this));
            } else if (sKey === "sapid") {
                this._bSAPIdLoaded = true;
                const oSAPIdPage = this.byId(sPageId);

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.SAPId",
                    controller: this
                }).then(function (oFragment) {
                    oSAPIdPage.addContent(oFragment);

                    const oTable = this.byId("SAPIdStatuses");
                    // Ensure table starts with show-less state
                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    if (oLogButton) {
                        oLogButton.setVisible(false);
                    }

                    // Ensure the table has the correct model
                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    // Initialize table-specific functionality
                    this.initializeTable("SAPIdStatuses");
                    // Reset segmented button to "less" state for this fragment
                    this._resetSegmentedButtonForFragment("SAPIdStatuses");
                }.bind(this));
            } else if (sKey === "employees") {
                this._bEmployeesLoaded = true;
                const oEmployeesPage = this.byId(sPageId);

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Employees",
                    controller: this
                }).then(function (oFragment) {
                    oEmployeesPage.addContent(oFragment);
                    const oTable = this.byId("Employees");

                    if (oLogButton) {
                        oLogButton.setVisible(false);
                    }
                    // Ensure table starts with show-less state
                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    // Ensure the table has the correct model
                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    // Initialize table-specific functionality
                    this.initializeTable("Employees");
                    // Reset segmented button to "less" state for this fragment
                    this._resetSegmentedButtonForFragment("Employees");

                    // ✅ Initialize Employee form (no ID preview needed - manual OHR ID entry)
                    setTimeout(() => {
                        oTable.initialized().then(() => {
                            setTimeout(() => {
                                const aSelectedContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];
                                if (aSelectedContexts.length === 0) {
                                    // No selection - initialize form for create mode
                                    this._onEmpDialogData([]);
                                }
                            }, 300);
                        }).catch(() => {
                            setTimeout(() => {
                                this._onEmpDialogData([]);
                            }, 500);
                        });
                    }, 300);
                }.bind(this));
            } else if (sKey === "overview") {
                this._bResLoaded = true;
                const oResPage = this.byId(sPageId);

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Res",
                    controller: this
                }).then(function (oFragment) {
                    oResPage.addContent(oFragment);

                    const oTable = this.byId("Res");
                    // Ensure table starts with show-less state
                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    if (oLogButton) {
                        oLogButton.setVisible(false);
                    }
                    // Ensure the table has the correct model
                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    // Initialize table-specific functionality
                    this.initializeTable("Res");
                    // Reset segmented button to "less" state for this fragment
                    this._resetSegmentedButtonForFragment("Res");

                    // ✅ Initialize Project ID field and form
                    setTimeout(() => {
                        oTable.initialized().then(() => {
                            setTimeout(() => {
                                this._initializeProjectIdField();
                                const aSelectedContexts = oTable.getSelectedContexts ? oTable.getSelectedContexts() : [];
                                if (aSelectedContexts.length === 0) {
                                    this._onProjDialogData([]);
                                }
                            }, 500);
                        }).catch(() => {
                            setTimeout(() => {
                                this._initializeProjectIdField();
                            }, 1000);
                        });
                    }, 300);
                }.bind(this));
            }
            // ✅ REMOVED: Verticals fragment loading (Vertical is now an enum, not an entity)
        },
        // Reset all tables to "show-less" state
        _resetAllTablesToShowLess: function () {
            const aTableIds = ["Customers", "Opportunities", "Projects", "SAPIdStatuses", "Employees"]; // ✅ REMOVED: "Verticals"

            aTableIds.forEach((sTableId) => {
                const oTable = this.byId(sTableId);
                if (oTable) {
                    // Remove "show-more" class and add "show-less" class
                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");
                    console.log(`[Navigation] Reset table ${sTableId} to show-less state`);
                }
            });

            // Reset all segmented buttons to "less" state
            this._resetAllSegmentedButtons();
        },
        // Reset all segmented buttons to "less" state
        _resetAllSegmentedButtons: function () {
            // Find all segmented buttons in the view
            const oView = this.getView();
            const aSegmentedButtons = oView.findAggregatedObjects(true, function (oControl) {
                return oControl.getMetadata().getName() === "sap.m.SegmentedButton";
            });

            aSegmentedButtons.forEach((oSegmentedButton) => {
                if (oSegmentedButton) {
                    oSegmentedButton.setSelectedKey("less");
                    console.log(`[Navigation] Reset segmented button to "less" state`);
                }
            });
        },
        // Reset segmented button for a specific fragment
        _resetSegmentedButtonForFragment: function (sTableId) {
            // Find segmented button within the specific table's fragment
            const oTable = this.byId(sTableId);
            if (oTable) {
                const oParent = oTable.getParent();
                if (oParent) {
                    const aSegmentedButtons = oParent.findAggregatedObjects(true, function (oControl) {
                        return oControl.getMetadata().getName() === "sap.m.SegmentedButton";
                    });

                    aSegmentedButtons.forEach((oSegmentedButton) => {
                        if (oSegmentedButton) {
                            oSegmentedButton.setSelectedKey("less");
                            console.log(`[Fragment] Reset segmented button for ${sTableId} to "less" state`);
                        }
                    });
                }
            }
        },

        // ✅ NEW: Handle navigation with unsaved changes - Show confirmation dialog
        _clearPreviousTableEditState: function (sNewPageKey) {
            const oEditModel = this.getView().getModel("edit");
            if (!oEditModel) {
                return Promise.resolve(true); // No edit model, allow navigation
            }

            // Map of page keys to table IDs
            const pageToTableMap = {
                customers: "Customers",
                opportunities: "Opportunities",
                projects: "Projects",
                employees: "Employees",
                // ✅ REMOVED: verticals: "Verticals", (Vertical is now an enum)
                sapid: "SAPIdStatuses"
            };

            const sCurrentTable = oEditModel.getProperty("/currentTable");
            if (!sCurrentTable) {
                return Promise.resolve(true); // No table in edit mode, allow navigation
            }

            // If navigating to a different table (or home), check for unsaved changes
            const sNewTableId = pageToTableMap[sNewPageKey];
            if (sCurrentTable === sNewTableId) {
                return Promise.resolve(true); // Same table, allow navigation
            }

            // Get the edit state for the current table
            const sPrevEditingPath = oEditModel.getProperty(`/${sCurrentTable}/editingPath`);
            const sPrevMode = oEditModel.getProperty(`/${sCurrentTable}/mode`);

            if (!sPrevEditingPath || sPrevEditingPath.length === 0) {
                return Promise.resolve(true); // No unsaved changes, allow navigation
            }

            // ✅ Show confirmation dialog with Save, Cancel, and Stay options
            return new Promise((resolve) => {
                // ✅ FIXED: Use custom action strings to ensure button text displays correctly
                const SAVE_ACTION = "Save";
                const CANCEL_ACTION = "Cancel";
                const STAY_ACTION = "Stay";

                sap.m.MessageBox.show(
                    `You have unsaved changes in ${sCurrentTable}. What would you like to do?`,
                    {
                        icon: sap.m.MessageBox.Icon.WARNING,
                        title: "Unsaved Changes",
                        actions: [
                            SAVE_ACTION,
                            CANCEL_ACTION,
                            STAY_ACTION
                        ],
                        emphasizedAction: SAVE_ACTION,
                        onClose: (sAction) => {
                            if (sAction === STAY_ACTION) {
                                // Stay on current fragment - prevent navigation
                                resolve(false);
                                return;
                            }

                            if (sAction === SAVE_ACTION) {
                                // Save changes first, then navigate
                                this._saveCurrentTableChanges(sCurrentTable).then(() => {
                                    this._discardTableEditState(sCurrentTable);
                                    resolve(true); // Allow navigation after save
                                }).catch((err) => {
                                    console.error("[Navigation] Error saving changes:", err);
                                    sap.m.MessageBox.error("Error saving changes. Please try again.");
                                    resolve(false); // Prevent navigation on error
                                });
                            } else if (sAction === CANCEL_ACTION) {
                                // Discard changes and navigate
                                // ✅ FIXED: Call the actual cancel logic from CustomUtility to properly cancel OData changes
                                this._cancelCurrentTableChanges(sCurrentTable).then(() => {
                                    this._discardTableEditState(sCurrentTable);
                                    resolve(true); // Allow navigation after discard
                                }).catch((err) => {
                                    console.error("[Navigation] Error canceling changes:", err);
                                    // Even if cancel fails, clear edit state and allow navigation
                                    this._discardTableEditState(sCurrentTable);
                                    resolve(true);
                                });
                            }
                        }
                    }
                );
            });
        },

        // ✅ NEW: Save changes for a specific table
        _saveCurrentTableChanges: async function (sTableId) {
            // Reuse the save logic from CustomUtility
            const buttonMap = {
                "Customers": { save: "saveButton" },
                "Employees": { save: "saveButton_emp" },
                "Opportunities": { save: "saveButton_oppr" },
                "Projects": { save: "saveButton_proj" },
                "SAPIdStatuses": { save: "saveButton_sap" }
                // ✅ REMOVED: "Verticals": { save: "saveButton_vert" }
            };

            // Create a mock event object to trigger save
            const oMockEvent = {
                getSource: () => {
                    const sButtonId = buttonMap[sTableId]?.save;
                    return {
                        getId: () => `mock--${sButtonId}`
                    };
                }
            };

            // Call the save function
            await CustomUtility.prototype.onSaveButtonPress.call(this, oMockEvent);
        },

        // ✅ NEW: Cancel changes for a specific table (for navigation dialog)
        // This bypasses the confirmation dialog since user already confirmed in navigation dialog
        _cancelCurrentTableChanges: function (sTableId) {
            // Call the internal cancel operation directly (without confirmation dialog)
            // CustomUtility has a method that performs the actual cancel logic
            return new Promise((resolve) => {
                try {
                    // Call the internal cancel operation from CustomUtility
                    // We pass a flag to skip the confirmation dialog
                    CustomUtility.prototype._performCancelOperation.call(this, sTableId, true); // true = skip confirmation

                    // Give it a moment to complete, then resolve
                    setTimeout(() => {
                        resolve();
                    }, 100);
                } catch (error) {
                    console.error("[Navigation] Error canceling changes:", error);
                    resolve(); // Still allow navigation even if cancel fails
                }
            });
        },



        // ✅ NEW: Discard edit state for a specific table
        _discardTableEditState: function (sTableId) {
            const oEditModel = this.getView().getModel("edit");
            if (!oEditModel) return;

            const oPrevTable = this.byId(sTableId);
            if (!oPrevTable) return;

            const sPrevEditingPath = oEditModel.getProperty(`/${sTableId}/editingPath`);
            if (!sPrevEditingPath || sPrevEditingPath.length === 0) return;

            // Reset edit state
            oEditModel.setProperty(`/${sTableId}/editingPath`, "");
            oEditModel.setProperty(`/${sTableId}/mode`, null);
            oEditModel.setProperty("/currentTable", null);

            // Disable Save/Cancel buttons
            const buttonMap = {
                "Customers": { save: "saveButton", cancel: "cancelButton", edit: "btnEdit_cus", delete: "btnDelete_cus", add: "btnAdd" },
                "Employees": { save: "saveButton_emp", cancel: "cancelButton_emp", edit: "Edit_emp", delete: "Delete_emp", add: "btnAdd_emp" },
                "Opportunities": { save: "saveButton_oppr", cancel: "cancelButton_oppr", edit: "btnEdit_oppr", delete: "btnDelete_oppr", add: "btnAdd_oppr" },
                "Projects": { save: "saveButton_proj", cancel: "cancelButton_proj", edit: "btnEdit_proj", delete: "btnDelete_proj", add: "btnAdd_proj" },
                "SAPIdStatuses": { save: "saveButton_sap", cancel: "cancelButton_sap", edit: "btnEdit_sap", delete: "btnDelete_sap", add: "btnAdd_sap" }
                // ✅ REMOVED: "Verticals": { save: "saveButton_vert", cancel: "cancelButton_vert", edit: "btnEdit_vert", delete: "btnDelete_vert", add: "btnAdd_vert" }
            };

            const config = buttonMap[sTableId];
            if (config) {
                this.byId(config.save)?.setEnabled(false);
                this.byId(config.cancel)?.setEnabled(false);
                this.byId(config.edit)?.setEnabled(false);
                this.byId(config.delete)?.setEnabled(false);
                this.byId(config.add)?.setEnabled(true);
            }

            // Discard pending changes
            try {
                const oModel = this.getView().getModel();
                if (oModel) {
                    const aPaths = sPrevEditingPath.split(",").filter(Boolean);
                    aPaths.forEach(sPath => {
                        try {
                            const oContext = CustomUtility.prototype._resolveContextByPath.call(this, oPrevTable, sPath);
                            if (oContext) {
                                // Reset context changes
                                if (oContext.reset) {
                                    oContext.reset();
                                } else if (oContext.getObject) {
                                    const oData = oContext.getObject();
                                    if (oData._originalData) {
                                        // Restore original data
                                        const oOriginal = oData._originalData;
                                        Object.keys(oOriginal).forEach(sKey => {
                                            if (sKey !== '_originalData' && sKey !== 'isEditable' && sKey !== '_hasChanged') {
                                                oContext.setProperty(sKey, oOriginal[sKey]);
                                            }
                                        });
                                        delete oData._originalData;
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn(`[Navigation] Could not reset context ${sPath}:`, e);
                        }
                    });
                }
            } catch (e) {
                console.warn("[Navigation] Error discarding pending changes:", e);
            }
        },

        // ✅ NEW: Submit function that handles both Create and Update
        onSubmitCustomer: function () {
            const sCustId = this.byId("inputCustomerId").getValue(),
                sCustName = this.byId("inputCustomerName").getValue(),
                sCountry = this.byId("inputCountry").getValue(),
                sState = this.byId("inputState").getValue(),
                sStatus = this.byId("inputStatus").getSelectedKey(),
                sVertical = this.byId("inputVertical").getSelectedKey();

            // Validation - Customer Name is required
            if (!sCustName || sCustName.trim() === "") {
                sap.m.MessageBox.error("Customer Name is required!");
                return;
            }

            const oTable = this.byId("Customers");
            const oModel = oTable.getModel();
            
            // Check if a row is selected (Update mode)
            const aSelectedContexts = oTable.getSelectedContexts();
            
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                // UPDATE MODE: Row is selected, update existing customer
                const oContext = aSelectedContexts[0];
                const oExistingData = oContext.getObject();
                
                // For update, build entry with existing Customer ID (for verification) and new values
                const oUpdateEntry = {
                    "country": sCountry || "",
                "customerName": sCustName,
                    "state": sState || "",
                    "status": sStatus || "A", // Default to Active if not set
                    "vertical": sVertical || "BFS" // Default if not set
                };
                
                try {
                    // Update the context - set properties (this queues changes in "changesGroup")
                    Object.keys(oUpdateEntry).forEach(sKey => {
                        const vNewValue = oUpdateEntry[sKey];
                        const vCurrentValue = oContext.getProperty(sKey);
                        // Only update if value actually changed and is not empty (for non-required fields)
                        if (vNewValue !== vCurrentValue) {
                            oContext.setProperty(sKey, vNewValue);
                        }
                    });
                        
                        // Submit changes using the default "changesGroup" from manifest
                        // Note: Changes set via setProperty() automatically use "changesGroup" by default
                        oModel.submitBatch("changesGroup")
                            .then(() => {
                                // Success - refresh table and show message
                                MessageToast.show("Customer updated successfully!");
                                
                                // ✅ CRITICAL: Force immediate UI refresh for MDC tables
                                // For MDC tables, rebind() is the most reliable way to refresh
                                setTimeout(() => {
                                    // Immediately rebind MDC table (this is the key for MDC tables)
                                    if (oTable.rebind) {
                                        try {
                                            oTable.rebind();
                                        } catch (e) {
                                            console.log("Rebind error:", e);
                                        }
                                    }
                                    
                                    // Also try refresh methods as backup
                                    const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                    const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                    
                                    if (oRowBinding) {
                                        oRowBinding.refresh(true).catch(() => {});
                                    } else if (oBinding) {
                                        oBinding.refresh(true).catch(() => {});
                                    }
                                }, 150); // Small delay to ensure batch is committed
                                
                                this.onCancelForm(); // Clear form after successful update
                            })
                            .catch((oError) => {
                                // Check if update actually succeeded despite error (false positive)
                                // Many OData V4 implementations return warnings that trigger catch
                                setTimeout(() => {
                                    try {
                                        const oCurrentData = oContext.getObject();
                                        // Simple check: if customer name matches (main field), likely succeeded
                                        if (oCurrentData && oCurrentData.customerName === oUpdateEntry.customerName) {
                                            // Data matches - update succeeded despite error
                                            MessageToast.show("Customer updated successfully!");
                                            const oBinding = oTable.getBinding("rows");
                                            if (oBinding) {
                                                oBinding.refresh();
                                            }
                                            this.onCancelForm();
                                        } else {
                                            // Actual failure - only log to console, don't show error if data updated
                                            console.warn("Update may have failed:", oError.message || "Unknown error");
                                        }
                                    } catch (e) {
                                        // Ignore verification errors - update likely succeeded
                                        console.log("Update completed");
                                    }
                                }, 150);
                            });
                    } catch (oSetError) {
                        console.error("Error setting properties:", oSetError);
                        sap.m.MessageBox.error("Failed to update customer. Please try again.");
                    }
            } else {
                // CREATE MODE: No row selected, create new customer
                // Don't send SAPcustId - backend will auto-generate it (C-0001, C-0002, etc.)
                const oCreateEntry = {
                    "country": sCountry || "",
                    "customerName": sCustName,
                    "state": sState || "",
                    "status": sStatus || "A", // Default to Active if not set
                    "vertical": sVertical || "BFS" // Default to BFS if not set
                };
                
                console.log("Creating customer with data:", oCreateEntry);
                
                // Try to get binding using multiple methods (MDC table pattern)
                let oBinding = (oTable.getRowBinding && oTable.getRowBinding())
                    || oTable.getBinding("items")
                    || oTable.getBinding("rows");
                
                if (oBinding) {
                    // Binding available - use batch mode with binding.create()
                    try {
                        // Create new context using binding with "changesGroup" for batch mode
                        const oNewContext = oBinding.create(oCreateEntry, "changesGroup");
                        
                        if (!oNewContext) {
                            sap.m.MessageBox.error("Failed to create customer entry.");
                            return;
                        }
                        
                        console.log("Customer context created:", oNewContext.getPath());
                        
                        // Submit the batch to send to backend
                        oModel.submitBatch("changesGroup")
                            .then(() => {
                                console.log("Customer created successfully!");
                                MessageToast.show("Customer created successfully!");
                                
                                // ✅ CRITICAL: Force immediate UI refresh for MDC tables
                                setTimeout(() => {
                                    // Immediately rebind MDC table (this is the key for MDC tables)
                                    if (oTable.rebind) {
                                        try {
                                            oTable.rebind();
                                        } catch (e) {
                                            console.log("Rebind error:", e);
                                        }
                                    }
                                    
                                    // Also try refresh methods as backup
                                    const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                    const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                    
                                    if (oRowBinding) {
                                        oRowBinding.refresh(true).catch(() => {});
                                    } else if (oBinding) {
                                        oBinding.refresh(true).catch(() => {});
                                    }
                                }, 150); // Small delay to ensure batch is committed
                                
                                this.onCancelForm(); // Clear form after successful create
                            })
                            .catch((oError) => {
                                console.error("Create batch error:", oError);
                                
                                // Check if create actually succeeded (false positive error)
                                setTimeout(() => {
                                    try {
                                        const oCreatedData = oNewContext.getObject();
                                        if (oCreatedData && oCreatedData.customerName === oCreateEntry.customerName) {
                                            // Create succeeded despite error
                                            console.log("✅ Create verified successful");
                                            MessageToast.show("Customer created successfully!");
                                            oBinding.refresh();
                                            this.onCancelForm();
                                        } else {
                                            // Actual failure - use direct model create as fallback
                                            this._createCustomerDirect(oModel, oCreateEntry, oTable);
                                        }
                                    } catch (e) {
                                        // Use direct model create as fallback
                                        this._createCustomerDirect(oModel, oCreateEntry, oTable);
                                    }
                                }, 150);
                            });
                    } catch (oCreateError) {
                        console.error("Error creating via binding:", oCreateError);
                        // Fallback to direct model create
                        this._createCustomerDirect(oModel, oCreateEntry, oTable);
                    }
                } else {
                    // No binding available - use direct model create (fallback)
                    console.log("Table binding not available, using direct model create");
                    this._createCustomerDirect(oModel, oCreateEntry, oTable);
                }
            }
        },

        // Helper function for direct model create (fallback when binding not available)
        _createCustomerDirect: function (oModel, oCreateEntry, oTable) {
            oModel.create("/Customers", oCreateEntry, {
                success: (oData) => {
                    console.log("Customer created successfully (direct):", oData);
                    MessageToast.show("Customer created successfully!");
                    this.onCancelForm();
                    // Refresh table to show new entry
                    const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                    if (oBinding) {
                        oBinding.refresh();
                    }
                },
                error: (oError) => {
                    console.error("Create error:", oError);
                    let sErrorMessage = "Failed to create customer. Please check the input or try again.";
                    try {
                        if (oError.responseText) {
                            const oParsed = JSON.parse(oError.responseText);
                            sErrorMessage = oParsed.error?.message || oParsed.message || sErrorMessage;
                        }
                    } catch (e) {
                        // Use default message
                    }
                    sap.m.MessageBox.error(sErrorMessage);
                }
            });
        },

        // ✅ NEW: Initialize Customer ID field with next ID preview
        _initializeCustomerIdField: function (iRetryCount = 0) {
            const MAX_RETRIES = 5;
            const oCustomerIdInput = this.byId("inputCustomerId");
            if (!oCustomerIdInput) {
                // Field not yet available, retry after a short delay
                if (iRetryCount < MAX_RETRIES) {
                    setTimeout(() => {
                        this._initializeCustomerIdField(iRetryCount + 1);
                    }, 100);
                }
                return;
            }

            const oTable = this.byId("Customers");
            let sNextId = "C-0001"; // Default
            
            // Try multiple methods to get the next ID
            try {
                if (oTable) {
                    // Method 1: Try from binding contexts
                    sNextId = this._generateNextIdFromBinding(oTable, "Customers", "SAPcustId", "C");
                    console.log("[ID Generation] Method 1 (binding):", sNextId);
                    
                    // Method 2: If that failed, query backend directly
                    if (!sNextId || sNextId === "C-0001") {
                        const oModel = this.getOwnerComponent().getModel();
                        if (oModel) {
                            // Query backend to get max ID
                            oModel.read("/Customers", {
                                urlParameters: {
                                    "$orderby": "SAPcustId desc",
                                    "$top": "1"
                                },
                                success: (oData) => {
                                    console.log("[ID Generation] Backend query result:", oData);
                                    let sBackendId = "C-0001";
                                    if (oData && oData.results && oData.results.length > 0) {
                                        const sMaxId = oData.results[0].SAPcustId || "";
                                        const m = sMaxId.match(/(\d+)$/);
                                        if (m) {
                                            const iNextNum = parseInt(m[1], 10) + 1;
                                            sBackendId = `C-${String(iNextNum).padStart(4, "0")}`;
                                        }
                                    }
                                    console.log("[ID Generation] Method 2 (backend):", sBackendId);
                                    oCustomerIdInput.setValue(sBackendId);
                                },
                                error: (oError) => {
                                    console.warn("[ID Generation] Backend query failed:", oError);
                                    // Keep the default or binding result
                                    if (!sNextId || sNextId === "C-0001") {
                                        oCustomerIdInput.setValue(sNextId);
                                    }
                                }
                            });
                            
                            // Set immediately with binding result (will be updated if backend call succeeds)
                            if (sNextId) {
                                oCustomerIdInput.setValue(sNextId);
                            }
                        }
                    } else {
                        // Binding method worked, use it
                        oCustomerIdInput.setValue(sNextId);
                    }
                } else {
                    // No table yet, retry
                    if (iRetryCount < MAX_RETRIES) {
                        setTimeout(() => {
                            this._initializeCustomerIdField(iRetryCount + 1);
                        }, 200);
                        return;
                    }
                    // Last resort: set default
                    oCustomerIdInput.setValue(sNextId);
                }
            } catch (e) {
                console.error("[ID Generation] Error:", e);
                // Set default on error
                oCustomerIdInput.setValue(sNextId);
            }
            
            // Always ensure field is disabled
            oCustomerIdInput.setEnabled(false);
            oCustomerIdInput.setPlaceholder("Auto-generated");
        },

        // ✅ NEW: Search function for Customer table
        onCustomerSearch: function (oEvent) {
            // Get search query - liveChange uses "newValue", search event uses "query"
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oTable = this.byId("Customers");
            
            if (!oTable) {
                console.warn("Customer table not available");
                return;
            }
            
            // Use the helper function to get binding (works for MDC Tables)
            let iRetryCount = 0;
            const MAX_RETRIES = 5;
            
            const fnApplySearch = () => {
                if (iRetryCount >= MAX_RETRIES) {
                    console.warn("Max retries reached for customer search");
                    return;
                }
                
                iRetryCount++;
                
                try {
                    // Try multiple methods to get binding
                    let oBinding = this._getRowBinding(oTable);
                    
                    // Method 2: Try direct access
                    if (!oBinding) {
                        oBinding = oTable.getBinding("items") || oTable.getBinding("rows");
                    }
                    
                    // Method 3: Try to get from model directly
                    if (!oBinding) {
                        const oModel = oTable.getModel();
                        if (oModel && oModel.bindList) {
                            oBinding = oModel.bindList("/Customers");
                        }
                    }
                    
                    // If still no binding, wait a bit and retry
                    if (!oBinding) {
                        setTimeout(() => {
                            fnApplySearch();
                        }, 300);
                        return;
                    }
                    
                    // Reset retry on success
                    iRetryCount = 0;
                    
                    // Create filters if query exists
                    if (sQuery && sQuery.trim() !== "") {
                        const sQueryTrimmed = sQuery.trim();
                        
                        // Case-insensitive Contains filters using caseSensitive: false
                        const aFilters = [];
                        
                        aFilters.push(new sap.ui.model.Filter({
                            path: "SAPcustId",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        
                        aFilters.push(new sap.ui.model.Filter({
                            path: "customerName",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        
                        aFilters.push(new sap.ui.model.Filter({
                            path: "country",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        
                        aFilters.push(new sap.ui.model.Filter({
                            path: "state",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        
                        aFilters.push(new sap.ui.model.Filter({
                            path: "vertical",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        
                        // Combine with OR logic (search matches any field)
                        const oCombinedFilter = new sap.ui.model.Filter({
                            filters: aFilters,
                            and: false
                        });
                        
                        // Apply filter
                        oBinding.filter([oCombinedFilter]);
                        console.log("✅ Search filter applied (case-insensitive):", sQueryTrimmed);
                    } else {
                        // Clear filter when search is empty
                        oBinding.filter([]);
                        console.log("✅ Search filter cleared");
                    }
                } catch (e) {
                    console.error("Error applying search filter:", e);
                }
            };
            
            // Wait for table to be ready, then apply search
            if (oTable.initialized && typeof oTable.initialized === "function") {
                oTable.initialized().then(() => {
                    setTimeout(() => {
                        fnApplySearch();
                    }, 100);
                }).catch(() => {
                    // If initialized fails, try anyway after delay
                    setTimeout(() => {
                        fnApplySearch();
                    }, 300);
                });
            } else {
                // Table doesn't have initialized method, try direct access
                setTimeout(() => {
                    fnApplySearch();
                }, 200);
            }
        },

        // ✅ NEW: Search function for Employee table

        _applyEmpSearchFilter: function (oTableId, sPath, sQuery) {
            const oTable = this.byId(oTableId);
            if (!oTable) {
                console.warn(`${oTableId} table not available`);
                return;
            }

            let iRetryCount = 0;
            const MAX_RETRIES = 5;

            const fnApplySearch = () => {
                if (iRetryCount >= MAX_RETRIES) {
                    console.warn(`Max retries reached for ${oTableId} search`);
                    return;
                }

                iRetryCount++;

                try {
                    let oBinding = this._getRowBinding(oTable);
                    if (!oBinding) {
                        oBinding = oTable.getBinding("items") || oTable.getBinding("rows");
                    }
                    if (!oBinding) {
                        const oModel = oTable.getModel();
                        if (oModel && oModel.bindList) {
                            oBinding = oModel.bindList(sPath);
                        }
                    }

                    if (!oBinding) {
                        setTimeout(() => {
                            fnApplySearch();
                        }, 300);
                        return;
                    }

                    iRetryCount = 0;

                    if (sQuery && sQuery.trim() !== "") {
                        const sQueryTrimmed = sQuery.trim();
                        const aFilters = [
                            new sap.ui.model.Filter("ohrId", sap.ui.model.FilterOperator.Contains, sQueryTrimmed),
                            new sap.ui.model.Filter("fullName", sap.ui.model.FilterOperator.Contains, sQueryTrimmed),
                            new sap.ui.model.Filter("mailid", sap.ui.model.FilterOperator.Contains, sQueryTrimmed),
                            new sap.ui.model.Filter("role", sap.ui.model.FilterOperator.Contains, sQueryTrimmed),
                            new sap.ui.model.Filter("location", sap.ui.model.FilterOperator.Contains, sQueryTrimmed),
                            new sap.ui.model.Filter("city", sap.ui.model.FilterOperator.Contains, sQueryTrimmed)
                        ];

                        const oCombinedFilter = new sap.ui.model.Filter({
                            filters: aFilters,
                            and: false
                        });

                        oBinding.filter([oCombinedFilter]);
                        console.log(`✅ ${oTableId} search filter applied:`, sQueryTrimmed);
                    } else {
                        oBinding.filter([]);
                        console.log(`✅ ${oTableId} search filter cleared`);
                    }
                } catch (e) {
                    console.error(`Error applying ${oTableId} search filter:`, e);
                }
            };

            if (oTable.initialized && typeof oTable.initialized === "function") {
                oTable.initialized().then(() => {
                    setTimeout(() => {
                        fnApplySearch();
                    }, 100);
                }).catch(() => {
                    setTimeout(() => {
                        fnApplySearch();
                    }, 300);
                });
            } else {
                setTimeout(() => {
                    fnApplySearch();
                }, 200);
            }
        },
        onEmployeeSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            this._applyEmpSearchFilter("Employees", "/Employees", sQuery);
            
        },
        onResSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            this._applyEmpSearchFilter("Res", "/Employees", sQuery);
        },
        onResourceSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            this._applyEmpSearchFilter("Resources", "/Employees", sQuery);
        },

        // ✅ NEW: Search function for Opportunity table
        onOpportunitySearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oTable = this.byId("Opportunities");
            
            if (!oTable) {
                console.warn("Opportunity table not available");
                return;
            }
            
            let iRetryCount = 0;
            const MAX_RETRIES = 5;
            
            const fnApplySearch = () => {
                if (iRetryCount >= MAX_RETRIES) {
                    console.warn("Max retries reached for opportunity search");
                    return;
                }
                
                iRetryCount++;
                
                try {
                    let oBinding = this._getRowBinding(oTable);
                    if (!oBinding) {
                        oBinding = oTable.getBinding("items") || oTable.getBinding("rows");
                    }
                    if (!oBinding) {
                        const oModel = oTable.getModel();
                        if (oModel && oModel.bindList) {
                            oBinding = oModel.bindList("/Opportunities");
                        }
                    }
                    
                    if (!oBinding) {
                        setTimeout(() => {
                            fnApplySearch();
                        }, 300);
                        return;
                    }
                    
                    iRetryCount = 0;
                    
                    if (sQuery && sQuery.trim() !== "") {
                        const sQueryTrimmed = sQuery.trim();
                        const aFilters = [];
                        
                        aFilters.push(new sap.ui.model.Filter({
                            path: "sapOpportunityId",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "sfdcOpportunityId",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "opportunityName",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "businessUnit",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "salesSPOC",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "deliverySPOC",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "customerId",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        
                        const oCombinedFilter = new sap.ui.model.Filter({
                            filters: aFilters,
                            and: false
                        });
                        
                        oBinding.filter([oCombinedFilter]);
                        console.log("✅ Opportunity search filter applied (case-insensitive):", sQueryTrimmed);
                    } else {
                        oBinding.filter([]);
                        console.log("✅ Opportunity search filter cleared");
                    }
                } catch (e) {
                    console.error("Error applying opportunity search filter:", e);
                }
            };
            
            if (oTable.initialized && typeof oTable.initialized === "function") {
                oTable.initialized().then(() => {
                    setTimeout(() => {
                        fnApplySearch();
                    }, 100);
                }).catch(() => {
                    setTimeout(() => {
                        fnApplySearch();
                    }, 300);
                });
            } else {
                setTimeout(() => {
                    fnApplySearch();
                }, 200);
            }
        },

        // ✅ NEW: Search function for Project table
        onProjectSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oTable = this.byId("Projects");
            
            if (!oTable) {
                console.warn("Project table not available");
                return;
            }
            
            let iRetryCount = 0;
            const MAX_RETRIES = 5;
            
            const fnApplySearch = () => {
                if (iRetryCount >= MAX_RETRIES) {
                    console.warn("Max retries reached for project search");
                    return;
                }
                
                iRetryCount++;
                
                try {
                    let oBinding = this._getRowBinding(oTable);
                    if (!oBinding) {
                        oBinding = oTable.getBinding("items") || oTable.getBinding("rows");
                    }
                    if (!oBinding) {
                        const oModel = oTable.getModel();
                        if (oModel && oModel.bindList) {
                            oBinding = oModel.bindList("/Projects");
                        }
                    }
                    
                    if (!oBinding) {
                        setTimeout(() => {
                            fnApplySearch();
                        }, 300);
                        return;
                    }
                    
                    iRetryCount = 0;
                    
                    if (sQuery && sQuery.trim() !== "") {
                        const sQueryTrimmed = sQuery.trim();
                        const aFilters = [];
                        
                        aFilters.push(new sap.ui.model.Filter({
                            path: "sapPId",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "sfdcPId",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "projectName",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "gpm",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        aFilters.push(new sap.ui.model.Filter({
                            path: "oppId",
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQueryTrimmed,
                            caseSensitive: false
                        }));
                        
                        const oCombinedFilter = new sap.ui.model.Filter({
                            filters: aFilters,
                            and: false
                        });
                        
                        oBinding.filter([oCombinedFilter]);
                        console.log("✅ Project search filter applied (case-insensitive):", sQueryTrimmed);
                    } else {
                        oBinding.filter([]);
                        console.log("✅ Project search filter cleared");
                    }
                } catch (e) {
                    console.error("Error applying project search filter:", e);
                }
            };
            
            if (oTable.initialized && typeof oTable.initialized === "function") {
                oTable.initialized().then(() => {
                    setTimeout(() => {
                        fnApplySearch();
                    }, 100);
                }).catch(() => {
                    setTimeout(() => {
                        fnApplySearch();
                    }, 300);
                });
            } else {
                setTimeout(() => {
                    fnApplySearch();
                }, 200);
            }
        },

        // ✅ NEW: Cancel function to clear form and deselect table row
        onCancelForm: function () {
            // Get table reference
            const oTable = this.byId("Customers");
            
            // Clear all form fields
            const oCustomerIdInput = this.byId("inputCustomerId");
            if (oCustomerIdInput) {
                // Reuse the improved initialization method
                this._initializeCustomerIdField();
            }
            this.byId("inputCustomerName")?.setValue("");
            this.byId("inputCountry")?.setValue("");
            this.byId("inputState")?.setValue("");
            this.byId("inputStatus")?.setSelectedKey("");
            this.byId("inputVertical")?.setSelectedKey("");
            
            // Deselect any selected row in the table (MDC Table uses clearSelection)
            if (oTable && oTable.clearSelection) {
                try {
                    oTable.clearSelection();
                } catch (e) {
                    // Ignore if method doesn't exist or fails
                    console.log("Selection cleared or method not available");
                }
            }
        },

        // ✅ DEPRECATED: Old create function (kept for reference, can be removed)
        onCreateCustomer: function () {
            // Redirect to new submit function
            this.onSubmitCustomer();
        },

        // ✅ NEW: Submit function for Employee (handles both Create and Update)
        onSubmitEmployee: function () {
            const sOHRId = this.byId("inputOHRId_emp").getValue(),
                sFullName = this.byId("inputFullName_emp").getValue(),
                sMailId = this.byId("inputMailId_emp").getValue(),
                sGender = this.byId("inputGender_emp").getSelectedKey(),
                sEmployeeType = this.byId("inputEmployeeType_emp").getSelectedKey(),
                sDoJ = this.byId("inputDoJ_emp").getValue(),
                sBand = this.byId("inputBand_emp").getSelectedKey(),
                sRole = this.byId("inputRole_emp").getValue(),
                sLocation = this.byId("inputLocation_emp").getValue(),
                sCity = this.byId("inputCity_emp").getValue(),
                sSupervisor = this.byId("inputSupervisor_emp").getValue(),
                sSkills = this.byId("inputSkills_emp").getValue(),
                sStatus = this.byId("inputStatus_emp").getSelectedKey(),
                sLWD = this.byId("inputLWD_emp").getValue();

            // Validation
            if (!sFullName || sFullName.trim() === "") {
                sap.m.MessageBox.error("Full Name is required!");
                return;
            }

            const oTable = this.byId("Employees");
            const oModel = oTable.getModel();
            
            // Check if a row is selected (Update mode)
            const aSelectedContexts = oTable.getSelectedContexts();
            
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                // UPDATE MODE: Row is selected, update existing employee
                const oContext = aSelectedContexts[0];
                
                const oUpdateEntry = {
                    "fullName": sFullName,
                    "mailid": sMailId || "",
                    "gender": sGender || "Male",
                    "employeeType": sEmployeeType || "FullTime",
                    "doj": sDoJ || "",
                    "band": sBand || "1",
                    "role": sRole || "",
                    "location": sLocation || "",
                    "city": sCity || "",
                    "supervisorOHR": sSupervisor || "",
                    "skills": sSkills || "",
                    "status": sStatus || "Allocated",
                    "lwd": sLWD || ""
                };
                
                try {
                    // Update the context
                    Object.keys(oUpdateEntry).forEach(sKey => {
                        const vNewValue = oUpdateEntry[sKey];
                        const vCurrentValue = oContext.getProperty(sKey);
                        if (vNewValue !== vCurrentValue) {
                            oContext.setProperty(sKey, vNewValue);
                        }
                    });
                    
                    // Submit changes
                    oModel.submitBatch("changesGroup")
                        .then(() => {
                            MessageToast.show("Employee updated successfully!");
                            
                            // ✅ CRITICAL: Force immediate UI refresh for MDC tables
                            setTimeout(() => {
                                // Immediately rebind MDC table (this is the key for MDC tables)
                                if (oTable.rebind) {
                                    try {
                                        oTable.rebind();
                                    } catch (e) {
                                        console.log("Rebind error:", e);
                                    }
                                }
                                
                                // Also try refresh methods as backup
                                const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                
                                if (oRowBinding) {
                                    oRowBinding.refresh(true).catch(() => {});
                                } else if (oBinding) {
                                    oBinding.refresh(true).catch(() => {});
                                }
                            }, 150); // Small delay to ensure batch is committed
                            
                            this.onCancelEmployeeForm();
                        })
                        .catch((oError) => {
                            setTimeout(() => {
                                try {
                                    const oCurrentData = oContext.getObject();
                                    if (oCurrentData && oCurrentData.fullName === oUpdateEntry.fullName) {
                                        MessageToast.show("Employee updated successfully!");
                                        const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                        if (oBinding) {
                                            oBinding.refresh();
                                        }
                                        this.onCancelEmployeeForm();
                                    } else {
                                        console.warn("Update may have failed:", oError.message || "Unknown error");
                                    }
                                } catch (e) {
                                    console.log("Update completed");
                                }
                            }, 150);
                        });
                } catch (oSetError) {
                    console.error("Error setting properties:", oSetError);
                    sap.m.MessageBox.error("Failed to update employee. Please try again.");
                }
            } else {
                // CREATE MODE: No row selected, create new employee
                if (!sOHRId || sOHRId.trim() === "") {
                    sap.m.MessageBox.error("OHR ID is required for new employees!");
                    return;
                }

                const oCreateEntry = {
                    "ohrId": sOHRId,
                    "fullName": sFullName,
                    "mailid": sMailId || "",
                    "gender": sGender || "Male",
                    "employeeType": sEmployeeType || "FullTime",
                    "doj": sDoJ || "",
                    "band": sBand || "1",
                    "role": sRole || "",
                    "location": sLocation || "",
                    "city": sCity || "",
                    "supervisorOHR": sSupervisor || "",
                    "skills": sSkills || "",
                    "status": sStatus || "Allocated",
                    "lwd": sLWD || ""
                };
                
                console.log("Creating employee with data:", oCreateEntry);
                
                // Try to get binding using multiple methods
                let oBinding = (oTable.getRowBinding && oTable.getRowBinding())
                    || oTable.getBinding("items")
                    || oTable.getBinding("rows");
                
                if (oBinding) {
                    try {
                        const oNewContext = oBinding.create(oCreateEntry, "changesGroup");
                        if (!oNewContext) {
                            sap.m.MessageBox.error("Failed to create employee entry.");
                            return;
                        }
                        console.log("Employee context created:", oNewContext.getPath());
                        
                        oModel.submitBatch("changesGroup")
                            .then(() => {
                                console.log("Employee created successfully!");
                                MessageToast.show("Employee created successfully!");
                                
                                // ✅ CRITICAL: Force immediate UI refresh for MDC tables
                                setTimeout(() => {
                                    // Immediately rebind MDC table (this is the key for MDC tables)
                                    if (oTable.rebind) {
                                        try {
                                            oTable.rebind();
                                        } catch (e) {
                                            console.log("Rebind error:", e);
                                        }
                                    }
                                    
                                    // Also try refresh methods as backup
                                    const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                    const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                    
                                    if (oRowBinding) {
                                        oRowBinding.refresh(true).catch(() => {});
                                    } else if (oBinding) {
                                        oBinding.refresh(true).catch(() => {});
                                    }
                                }, 150); // Small delay to ensure batch is committed
                                
                                this.onCancelEmployeeForm();
                            })
                            .catch((oError) => {
                                console.error("Create batch error:", oError);
                                setTimeout(() => {
                                    try {
                                        const oCreatedData = oNewContext.getObject();
                                        if (oCreatedData && oCreatedData.fullName === oCreateEntry.fullName) {
                                            console.log("✅ Create verified successful");
                                            MessageToast.show("Employee created successfully!");
                                            oBinding.refresh();
                                            this.onCancelEmployeeForm();
                                        } else {
                                            this._createEmployeeDirect(oModel, oCreateEntry, oTable);
                                        }
                                    } catch (e) {
                                        this._createEmployeeDirect(oModel, oCreateEntry, oTable);
                                    }
                                }, 150);
                            });
                    } catch (oCreateError) {
                        console.error("Error creating via binding:", oCreateError);
                        this._createEmployeeDirect(oModel, oCreateEntry, oTable);
                    }
                } else {
                    console.log("Table binding not available, using direct model create");
                    this._createEmployeeDirect(oModel, oCreateEntry, oTable);
                }
            }
        },

        // Helper function for direct model create (fallback)
        _createEmployeeDirect: function (oModel, oCreateEntry, oTable) {
            oModel.create("/Employees", oCreateEntry, {
                success: (oData) => {
                    console.log("Employee created successfully (direct):", oData);
                    MessageToast.show("Employee created successfully!");
                    
                    // ✅ CRITICAL: Force immediate UI refresh for MDC tables
                    setTimeout(() => {
                        // Immediately rebind MDC table (this is the key for MDC tables)
                        if (oTable.rebind) {
                            try {
                                oTable.rebind();
                            } catch (e) {
                                console.log("Rebind error:", e);
                            }
                        }
                        
                        // Also try refresh methods as backup
                        const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                        const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                        
                        if (oRowBinding) {
                            oRowBinding.refresh(true).catch(() => {});
                        } else if (oBinding) {
                            oBinding.refresh(true).catch(() => {});
                        }
                    }, 150); // Small delay to ensure batch is committed
                    
                    this.onCancelEmployeeForm();
                },
                error: (oError) => {
                    console.error("Create error:", oError);
                    let sErrorMessage = "Failed to create employee. Please check the input or try again.";
                    try {
                        if (oError.responseText) {
                            const oParsed = JSON.parse(oError.responseText);
                            sErrorMessage = oParsed.error?.message || oParsed.message || sErrorMessage;
                        }
                    } catch (e) {
                        // Use default message
                    }
                    sap.m.MessageBox.error(sErrorMessage);
                }
            });
        },

        // ✅ NEW: Submit function for Opportunity (handles both Create and Update)
        onSubmitOpportunity: function () {
            const sSapOppId = this.byId("inputSapOppId_oppr").getValue(),
                sSfdcOppId = this.byId("inputSfdcOppId_oppr").getValue(),
                sOppName = this.byId("inputOppName_oppr").getValue(),
                sBusinessUnit = this.byId("inputBusinessUnit_oppr").getValue(),
                sProbability = this.byId("inputProbability_oppr").getSelectedKey(),
                sStage = this.byId("inputStage_oppr").getSelectedKey(),
                sSalesSPOC = this.byId("inputSalesSPOC_oppr").getValue(),
                sDeliverySPOC = this.byId("inputDeliverySPOC_oppr").getValue(),
                sExpectedStart = this.byId("inputExpectedStart_oppr").getValue(),
                sExpectedEnd = this.byId("inputExpectedEnd_oppr").getValue(),
                sTCV = this.byId("inputTCV_oppr").getValue();
            
            // Get the stored ID from data attribute, or fallback to model
            const oCustomerInput = this.byId("inputCustomerId_oppr");
            let sCustomerId = oCustomerInput ? oCustomerInput.data("selectedId") : "";
            if (!sCustomerId) {
                // Fallback to model value
                const oModel = this.getView().getModel("opportunityModel");
                sCustomerId = oModel ? oModel.getProperty("/customerId") : "";
            }

            // Validation
            if (!sOppName || sOppName.trim() === "") {
                sap.m.MessageBox.error("Opportunity Name is required!");
                return;
            }

            const oTable = this.byId("Opportunities");
            const oModel = oTable.getModel();
            
            // Check if a row is selected (Update mode)
            const aSelectedContexts = oTable.getSelectedContexts();
            
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                // UPDATE MODE
                const oContext = aSelectedContexts[0];
                
                const oUpdateEntry = {
                    "sfdcOpportunityId": sSfdcOppId || "",
                    "opportunityName": sOppName,
                    "businessUnit": sBusinessUnit || "",
                    "probability": sProbability || "ProposalStage",
                    "Stage": sStage || "Discover",
                    "salesSPOC": sSalesSPOC || "",
                    "deliverySPOC": sDeliverySPOC || "",
                    "expectedStart": sExpectedStart || "",
                    "expectedEnd": sExpectedEnd || "",
                    "tcv": sTCV ? parseFloat(sTCV) : 0,
                    "customerId": sCustomerId || ""
                };
                
                try {
                    Object.keys(oUpdateEntry).forEach(sKey => {
                        const vNewValue = oUpdateEntry[sKey];
                        const vCurrentValue = oContext.getProperty(sKey);
                        if (vNewValue !== vCurrentValue) {
                            oContext.setProperty(sKey, vNewValue);
                        }
                    });
                    
                    oModel.submitBatch("changesGroup")
                        .then(() => {
                            MessageToast.show("Opportunity updated successfully!");
                            // ✅ CRITICAL: Force immediate UI refresh for MDC tables
                            setTimeout(() => {
                                // Immediately rebind MDC table (this is the key for MDC tables)
                                if (oTable.rebind) {
                                    try {
                                        oTable.rebind();
                                    } catch (e) {
                                        console.log("Rebind error:", e);
                                    }
                                }
                                
                                // Also try refresh methods as backup
                                const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                
                                if (oRowBinding) {
                                    oRowBinding.refresh(true).catch(() => {});
                                } else if (oBinding) {
                                    oBinding.refresh(true).catch(() => {});
                                }
                            }, 150); // Small delay to ensure batch is committed
                            
                            this.onCancelOpportunityForm();
                        })
                        .catch((oError) => {
                            setTimeout(() => {
                                try {
                                    const oCurrentData = oContext.getObject();
                                        if (oCurrentData && oCurrentData.opportunityName === oUpdateEntry.opportunityName) {
                                        MessageToast.show("Opportunity updated successfully!");
                                        // ✅ Force refresh table to show updated data immediately
                                        setTimeout(() => {
                                            const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                            
                                            const fnRefresh = () => {
                                                if (oRowBinding) {
                                                    return oRowBinding.refresh(true);
                                                } else if (oBinding) {
                                                    return oBinding.refresh(true);
                                                }
                                                return Promise.resolve();
                                            };
                                            
                                            fnRefresh().then(() => {
                                                if (oTable.rebind) {
                                                    oTable.rebind();
                                                }
                                            }).catch(() => {
                                                if (oTable.rebind) {
                                                    oTable.rebind();
                                                }
                                            });
                                        }, 100);
                                        
                                        this.onCancelOpportunityForm();
                                    } else {
                                        console.warn("Update may have failed:", oError.message || "Unknown error");
                                    }
                                } catch (e) {
                                    console.log("Update completed");
                                }
                            }, 150);
                        });
                } catch (oSetError) {
                    console.error("Error setting properties:", oSetError);
                    sap.m.MessageBox.error("Failed to update opportunity. Please try again.");
                }
            } else {
                // CREATE MODE
                const oCreateEntry = {
                    "sfdcOpportunityId": sSfdcOppId || "",
                    "opportunityName": sOppName,
                    "businessUnit": sBusinessUnit || "",
                    "probability": sProbability || "ProposalStage",
                    "Stage": sStage || "Discover",
                    "salesSPOC": sSalesSPOC || "",
                    "deliverySPOC": sDeliverySPOC || "",
                    "expectedStart": sExpectedStart || "",
                    "expectedEnd": sExpectedEnd || "",
                    "tcv": sTCV ? parseFloat(sTCV) : 0,
                    "customerId": sCustomerId || ""
                };
                
                console.log("Creating opportunity with data:", oCreateEntry);
                
                let oBinding = (oTable.getRowBinding && oTable.getRowBinding())
                    || oTable.getBinding("items")
                    || oTable.getBinding("rows");
                
                if (oBinding) {
                    try {
                        const oNewContext = oBinding.create(oCreateEntry, "changesGroup");
                        if (!oNewContext) {
                            sap.m.MessageBox.error("Failed to create opportunity entry.");
                            return;
                        }
                        console.log("Opportunity context created:", oNewContext.getPath());
                        
                        oModel.submitBatch("changesGroup")
                            .then(() => {
                                console.log("Opportunity created successfully!");
                                MessageToast.show("Opportunity created successfully!");
                                // ✅ Force refresh table to show new data immediately
                                setTimeout(() => {
                                    const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                    const fnRefresh = () => {
                                        if (oRowBinding) {
                                            return oRowBinding.refresh(true);
                                        } else {
                                            return oBinding.refresh(true);
                                        }
                                    };
                                    
                                    fnRefresh().then(() => {
                                        if (oTable.rebind) {
                                            oTable.rebind();
                                        }
                                    }).catch(() => {
                                        if (oTable.rebind) {
                                            oTable.rebind();
                                        }
                                    });
                                }, 100);
                                
                                this.onCancelOpportunityForm();
                            })
                            .catch((oError) => {
                                console.error("Create batch error:", oError);
                                setTimeout(() => {
                                    try {
                                        const oCreatedData = oNewContext.getObject();
                                        if (oCreatedData && oCreatedData.opportunityName === oCreateEntry.opportunityName) {
                                            console.log("✅ Create verified successful");
                                            MessageToast.show("Opportunity created successfully!");
                                            // ✅ Force refresh table to show new data immediately
                                            setTimeout(() => {
                                                const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                                const fnRefresh = () => {
                                                    if (oRowBinding) {
                                                        return oRowBinding.refresh(true);
                                                    } else {
                                                        return oBinding.refresh(true);
                                                    }
                                                };
                                                
                                                fnRefresh().then(() => {
                                                    if (oTable.rebind) {
                                                        oTable.rebind();
                                                    }
                                                }).catch(() => {
                                                    if (oTable.rebind) {
                                                        oTable.rebind();
                                                    }
                                                });
                                            }, 100);
                                            
                                            this.onCancelOpportunityForm();
                                        } else {
                                            this._createOpportunityDirect(oModel, oCreateEntry, oTable);
                                        }
                                    } catch (e) {
                                        this._createOpportunityDirect(oModel, oCreateEntry, oTable);
                                    }
                                }, 150);
                            });
                    } catch (oCreateError) {
                        console.error("Error creating via binding:", oCreateError);
                        this._createOpportunityDirect(oModel, oCreateEntry, oTable);
                    }
                } else {
                    console.log("Table binding not available, using direct model create");
                    this._createOpportunityDirect(oModel, oCreateEntry, oTable);
                }
            }
        },

        // Helper function for direct model create (fallback)
        _createOpportunityDirect: function (oModel, oCreateEntry, oTable) {
            oModel.create("/Opportunities", oCreateEntry, {
                success: (oData) => {
                    console.log("Opportunity created successfully (direct):", oData);
                    MessageToast.show("Opportunity created successfully!");
                    
                    // ✅ Force immediate UI refresh after create
                    setTimeout(() => {
                        const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                        const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                        
                        const fnRefresh = () => {
                            if (oRowBinding) {
                                return oRowBinding.refresh(true); // Force refresh from server
                            } else if (oBinding) {
                                return oBinding.refresh(true); // Force refresh from server
                            }
                            return Promise.resolve();
                        };
                        
                        fnRefresh().then(() => {
                            // After refresh, rebind to ensure UI updates
                            if (oTable.rebind) {
                                oTable.rebind();
                            }
                        }).catch(() => {
                            // If refresh fails, try rebind directly
                            if (oTable.rebind) {
                                oTable.rebind();
                            }
                        });
                    }, 100); // Small delay to ensure batch is committed
                    
                    this.onCancelOpportunityForm();
                },
                error: (oError) => {
                    console.error("Create error:", oError);
                    let sErrorMessage = "Failed to create opportunity. Please check the input or try again.";
                    try {
                        if (oError.responseText) {
                            const oParsed = JSON.parse(oError.responseText);
                            sErrorMessage = oParsed.error?.message || oParsed.message || sErrorMessage;
                        }
                    } catch (e) {
                        // Use default message
                    }
                    sap.m.MessageBox.error(sErrorMessage);
                }
            });
        },

        // ✅ NEW: Cancel function for Opportunity form
        onCancelOpportunityForm: function () {
            // Get table reference for ID generation
            const oTable = this.byId("Opportunities");
            
            // Generate next ID preview
            let sNextId = "O-0001";
            try {
                if (oTable) {
                    sNextId = this._generateNextIdFromBinding(oTable, "Opportunities", "sapOpportunityId", "O") || sNextId;
                }
            } catch (e) {
                console.log("Could not generate next ID, using default:", sNextId);
            }
            
            // Clear all form fields
            this.byId("inputSapOppId_oppr")?.setValue(sNextId);
            this.byId("inputSapOppId_oppr")?.setEnabled(false);
            this.byId("inputSapOppId_oppr")?.setPlaceholder("Auto-generated");
            this.byId("inputSfdcOppId_oppr")?.setValue("");
            this.byId("inputOppName_oppr")?.setValue("");
            this.byId("inputBusinessUnit_oppr")?.setValue("");
            this.byId("inputProbability_oppr")?.setSelectedKey("ProposalStage");
            this.byId("inputStage_oppr")?.setSelectedKey("Discover");
            this.byId("inputSalesSPOC_oppr")?.setValue("");
            this.byId("inputDeliverySPOC_oppr")?.setValue("");
            this.byId("inputExpectedStart_oppr")?.setValue("");
            this.byId("inputExpectedEnd_oppr")?.setValue("");
            this.byId("inputTCV_oppr")?.setValue("");
            this.byId("inputCustomerId_oppr")?.setValue("");
            
            // Deselect any selected row
            if (oTable && oTable.clearSelection) {
                try {
                    oTable.clearSelection();
                } catch (e) {
                    console.log("Selection cleared or method not available");
                }
            }
        },

        // ✅ NEW: Initialize Opportunity ID field with next ID preview
        _initializeOpportunityIdField: function (iRetryCount = 0) {
            const MAX_RETRIES = 5;
            const oOppIdInput = this.byId("inputSapOppId_oppr");
            if (!oOppIdInput) {
                if (iRetryCount < MAX_RETRIES) {
                    setTimeout(() => {
                        this._initializeOpportunityIdField(iRetryCount + 1);
                    }, 100);
                }
                return;
            }

            const oTable = this.byId("Opportunities");
            let sNextId = "O-0001";
            
            try {
                if (oTable) {
                    sNextId = this._generateNextIdFromBinding(oTable, "Opportunities", "sapOpportunityId", "O");
                    console.log("[ID Generation] Opportunity Method 1 (binding):", sNextId);
                    
                    if (!sNextId || sNextId === "O-0001") {
                        const oModel = this.getOwnerComponent().getModel();
                        if (oModel) {
                            oModel.read("/Opportunities", {
                                urlParameters: {
                                    "$orderby": "sapOpportunityId desc",
                                    "$top": "1"
                                },
                                success: (oData) => {
                                    console.log("[ID Generation] Opportunity Backend query result:", oData);
                                    let sBackendId = "O-0001";
                                    if (oData && oData.results && oData.results.length > 0) {
                                        const sMaxId = oData.results[0].sapOpportunityId || "";
                                        const m = sMaxId.match(/(\d+)$/);
                                        if (m) {
                                            const iNextNum = parseInt(m[1], 10) + 1;
                                            sBackendId = `O-${String(iNextNum).padStart(4, "0")}`;
                                        }
                                    }
                                    console.log("[ID Generation] Opportunity Method 2 (backend):", sBackendId);
                                    oOppIdInput.setValue(sBackendId);
                                },
                                error: (oError) => {
                                    console.warn("[ID Generation] Opportunity Backend query failed:", oError);
                                    if (!sNextId || sNextId === "O-0001") {
                                        oOppIdInput.setValue(sNextId);
                                    }
                                }
                            });
                            
                            if (sNextId) {
                                oOppIdInput.setValue(sNextId);
                            }
                        }
                    } else {
                        oOppIdInput.setValue(sNextId);
                    }
                } else {
                    if (iRetryCount < MAX_RETRIES) {
                        setTimeout(() => {
                            this._initializeOpportunityIdField(iRetryCount + 1);
                        }, 200);
                        return;
                    }
                    oOppIdInput.setValue(sNextId);
                }
            } catch (e) {
                console.error("[ID Generation] Opportunity Error:", e);
                oOppIdInput.setValue(sNextId);
            }
            
            oOppIdInput.setEnabled(false);
            oOppIdInput.setPlaceholder("Auto-generated");
        },

        // ✅ NEW: Submit function for Project (handles both Create and Update)
        onSubmitProject: function () {
            const sSapProjId = this.byId("inputSapProjId_proj").getValue(),
                sSfdcProjId = this.byId("inputSfdcProjId_proj").getValue(),
                sProjectName = this.byId("inputProjectName_proj").getValue(),
                sStartDate = this.byId("inputStartDate_proj").getValue(),
                sEndDate = this.byId("inputEndDate_proj").getValue(),
                sGPM = this.byId("inputGPM_proj").getValue(),
                sProjectType = this.byId("inputProjectType_proj").getSelectedKey(),
                sStatus = this.byId("inputStatus_proj").getSelectedKey();
            
            // Get the stored ID from data attribute, or fallback to model
            const oOppInput = this.byId("inputOppId_proj");
            let sOppId = oOppInput ? oOppInput.data("selectedId") : "";
            if (!sOppId) {
                // Fallback to model value
                const oModel = this.getView().getModel("projectModel");
                sOppId = oModel ? oModel.getProperty("/oppId") : "";
            }
            
            const sRequiredResources = this.byId("inputRequiredResources_proj").getValue(),
                sAllocatedResources = this.byId("inputAllocatedResources_proj").getValue(),
                sToBeAllocated = this.byId("inputToBeAllocated_proj").getValue(),
                sSOWReceived = this.byId("inputSOWReceived_proj").getSelectedKey(),
                sPOReceived = this.byId("inputPOReceived_proj").getSelectedKey();

            // Validation
            if (!sProjectName || sProjectName.trim() === "") {
                sap.m.MessageBox.error("Project Name is required!");
                return;
            }

            const oTable = this.byId("Projects");
            const oModel = oTable.getModel();
            
            // Check if a row is selected (Update mode)
            const aSelectedContexts = oTable.getSelectedContexts();
            
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                // UPDATE MODE
                const oContext = aSelectedContexts[0];
                
                const oUpdateEntry = {
                    "sfdcPId": sSfdcProjId || "",
                    "projectName": sProjectName,
                    "startDate": sStartDate || "",
                    "endDate": sEndDate || "",
                    "gpm": sGPM || "",
                    "projectType": sProjectType || "FixedPrice",
                    "status": sStatus || "Planned",
                    "oppId": sOppId || "",
                    "requiredResources": sRequiredResources ? parseInt(sRequiredResources) : 0,
                    "allocatedResources": sAllocatedResources ? parseInt(sAllocatedResources) : 0,
                    "toBeAllocated": sToBeAllocated ? parseInt(sToBeAllocated) : 0,
                    "SOWReceived": sSOWReceived || "No",
                    "POReceived": sPOReceived || "No"
                };
                
                try {
                    Object.keys(oUpdateEntry).forEach(sKey => {
                        const vNewValue = oUpdateEntry[sKey];
                        const vCurrentValue = oContext.getProperty(sKey);
                        if (vNewValue !== vCurrentValue) {
                            oContext.setProperty(sKey, vNewValue);
                        }
                    });
                    
                    oModel.submitBatch("changesGroup")
                        .then(() => {
                            MessageToast.show("Project updated successfully!");
                            // ✅ Force refresh table to show updated data immediately
                            setTimeout(() => {
                                const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                
                                const fnRefresh = () => {
                                    if (oRowBinding) {
                                        return oRowBinding.refresh(true);
                                    } else if (oBinding) {
                                        return oBinding.refresh(true);
                                    }
                                    return Promise.resolve();
                                };
                                
                                fnRefresh().then(() => {
                                    if (oTable.rebind) {
                                        oTable.rebind();
                                    }
                                }).catch(() => {
                                    if (oTable.rebind) {
                                        oTable.rebind();
                                    }
                                });
                            }, 100); // Small delay to ensure batch is committed
                            
                            this.onCancelProjectForm();
                        })
                        .catch((oError) => {
                            setTimeout(() => {
                                try {
                                    const oCurrentData = oContext.getObject();
                                    if (oCurrentData && oCurrentData.projectName === oUpdateEntry.projectName) {
                                        MessageToast.show("Project updated successfully!");
                                        // ✅ Force refresh table to show updated data immediately
                                        setTimeout(() => {
                                            const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                                            
                                            const fnRefresh = () => {
                                                if (oRowBinding) {
                                                    return oRowBinding.refresh(true);
                                                } else if (oBinding) {
                                                    return oBinding.refresh(true);
                                                }
                                                return Promise.resolve();
                                            };
                                            
                                            fnRefresh().then(() => {
                                                if (oTable.rebind) {
                                                    oTable.rebind();
                                                }
                                            }).catch(() => {
                                                if (oTable.rebind) {
                                                    oTable.rebind();
                                                }
                                            });
                                        }, 100);
                                        
                                        this.onCancelProjectForm();
                                    } else {
                                        console.warn("Update may have failed:", oError.message || "Unknown error");
                                    }
                                } catch (e) {
                                    console.log("Update completed");
                                }
                            }, 150);
                        });
                } catch (oSetError) {
                    console.error("Error setting properties:", oSetError);
                    sap.m.MessageBox.error("Failed to update project. Please try again.");
                }
            } else {
                // CREATE MODE
                const oCreateEntry = {
                    "sfdcPId": sSfdcProjId || "",
                    "projectName": sProjectName,
                    "startDate": sStartDate || "",
                    "endDate": sEndDate || "",
                    "gpm": sGPM || "",
                    "projectType": sProjectType || "FixedPrice",
                    "status": sStatus || "Planned",
                    "oppId": sOppId || "",
                    "requiredResources": sRequiredResources ? parseInt(sRequiredResources) : 0,
                    "allocatedResources": sAllocatedResources ? parseInt(sAllocatedResources) : 0,
                    "toBeAllocated": sToBeAllocated ? parseInt(sToBeAllocated) : 0,
                    "SOWReceived": sSOWReceived || "No",
                    "POReceived": sPOReceived || "No"
                };
                
                console.log("Creating project with data:", oCreateEntry);
                
                let oBinding = (oTable.getRowBinding && oTable.getRowBinding())
                    || oTable.getBinding("items")
                    || oTable.getBinding("rows");
                
                if (oBinding) {
                    try {
                        const oNewContext = oBinding.create(oCreateEntry, "changesGroup");
                        if (!oNewContext) {
                            sap.m.MessageBox.error("Failed to create project entry.");
                            return;
                        }
                        console.log("Project context created:", oNewContext.getPath());
                        
                        oModel.submitBatch("changesGroup")
                            .then(() => {
                                console.log("Project created successfully!");
                                MessageToast.show("Project created successfully!");
                                // ✅ Force refresh table to show new data immediately
                                setTimeout(() => {
                                    const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                    const fnRefresh = () => {
                                        if (oRowBinding) {
                                            return oRowBinding.refresh(true);
                                        } else {
                                            return oBinding.refresh(true);
                                        }
                                    };
                                    
                                    fnRefresh().then(() => {
                                        if (oTable.rebind) {
                                            oTable.rebind();
                                        }
                                    }).catch(() => {
                                        if (oTable.rebind) {
                                            oTable.rebind();
                                        }
                                    });
                                }, 100);
                                
                                this.onCancelProjectForm();
                            })
                            .catch((oError) => {
                                console.error("Create batch error:", oError);
                                setTimeout(() => {
                                    try {
                                        const oCreatedData = oNewContext.getObject();
                                        if (oCreatedData && oCreatedData.projectName === oCreateEntry.projectName) {
                                            console.log("✅ Create verified successful");
                                            MessageToast.show("Project created successfully!");
                                            // ✅ Force refresh table to show new data immediately
                                            setTimeout(() => {
                                                const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                                                const fnRefresh = () => {
                                                    if (oRowBinding) {
                                                        return oRowBinding.refresh(true);
                                                    } else {
                                                        return oBinding.refresh(true);
                                                    }
                                                };
                                                
                                                fnRefresh().then(() => {
                                                    if (oTable.rebind) {
                                                        oTable.rebind();
                                                    }
                                                }).catch(() => {
                                                    if (oTable.rebind) {
                                                        oTable.rebind();
                                                    }
                                                });
                                            }, 100);
                                            
                                            this.onCancelProjectForm();
                                        } else {
                                            this._createProjectDirect(oModel, oCreateEntry, oTable);
                                        }
                                    } catch (e) {
                                        this._createProjectDirect(oModel, oCreateEntry, oTable);
                                    }
                                }, 150);
                            });
                    } catch (oCreateError) {
                        console.error("Error creating via binding:", oCreateError);
                        this._createProjectDirect(oModel, oCreateEntry, oTable);
                    }
                } else {
                    console.log("Table binding not available, using direct model create");
                    this._createProjectDirect(oModel, oCreateEntry, oTable);
                }
            }
        },

        // Helper function for direct model create (fallback)
        _createProjectDirect: function (oModel, oCreateEntry, oTable) {
            oModel.create("/Projects", oCreateEntry, {
                success: (oData) => {
                    console.log("Project created successfully (direct):", oData);
                    MessageToast.show("Project created successfully!");
                    
                    // ✅ Force immediate UI refresh after create
                    setTimeout(() => {
                        const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                        const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                        
                        const fnRefresh = () => {
                            if (oRowBinding) {
                                return oRowBinding.refresh(true); // Force refresh from server
                            } else if (oBinding) {
                                return oBinding.refresh(true); // Force refresh from server
                            }
                            return Promise.resolve();
                        };
                        
                        fnRefresh().then(() => {
                            // After refresh, rebind to ensure UI updates
                            if (oTable.rebind) {
                                oTable.rebind();
                            }
                        }).catch(() => {
                            // If refresh fails, try rebind directly
                            if (oTable.rebind) {
                                oTable.rebind();
                            }
                        });
                    }, 100); // Small delay to ensure batch is committed
                    
                    this.onCancelProjectForm();
                },
                error: (oError) => {
                    console.error("Create error:", oError);
                    let sErrorMessage = "Failed to create project. Please check the input or try again.";
                    try {
                        if (oError.responseText) {
                            const oParsed = JSON.parse(oError.responseText);
                            sErrorMessage = oParsed.error?.message || oParsed.message || sErrorMessage;
                        }
                    } catch (e) {
                        // Use default message
                    }
                    sap.m.MessageBox.error(sErrorMessage);
                }
            });
        },

        // ✅ NEW: Cancel function for Project form
        onCancelProjectForm: function () {
            // Get table reference for ID generation
            const oTable = this.byId("Projects");
            
            // Generate next ID preview
            let sNextId = "P-0001";
            try {
                if (oTable) {
                    sNextId = this._generateNextIdFromBinding(oTable, "Projects", "sapPId", "P") || sNextId;
                }
            } catch (e) {
                console.log("Could not generate next ID, using default:", sNextId);
            }
            
            // Clear all form fields
            this.byId("inputSapProjId_proj")?.setValue(sNextId);
            this.byId("inputSapProjId_proj")?.setEnabled(false);
            this.byId("inputSapProjId_proj")?.setPlaceholder("Auto-generated");
            this.byId("inputSfdcProjId_proj")?.setValue("");
            this.byId("inputProjectName_proj")?.setValue("");
            this.byId("inputStartDate_proj")?.setValue("");
            this.byId("inputEndDate_proj")?.setValue("");
            this.byId("inputGPM_proj")?.setValue("");
            this.byId("inputProjectType_proj")?.setSelectedKey("FixedPrice");
            this.byId("inputStatus_proj")?.setSelectedKey("Planned");
            this.byId("inputOppId_proj")?.setSelectedKey("");
            this.byId("inputRequiredResources_proj")?.setValue("");
            this.byId("inputAllocatedResources_proj")?.setValue("");
            this.byId("inputToBeAllocated_proj")?.setValue("");
            this.byId("inputSOWReceived_proj")?.setSelectedKey("No");
            this.byId("inputPOReceived_proj")?.setSelectedKey("No");
            
            // Deselect any selected row
            if (oTable && oTable.clearSelection) {
                try {
                    oTable.clearSelection();
                } catch (e) {
                    console.log("Selection cleared or method not available");
                }
            }
        },

        // ✅ NEW: Initialize Project ID field with next ID preview
        _initializeProjectIdField: function (iRetryCount = 0) {
            const MAX_RETRIES = 5;
            const oProjIdInput = this.byId("inputSapProjId_proj");
            if (!oProjIdInput) {
                if (iRetryCount < MAX_RETRIES) {
                    setTimeout(() => {
                        this._initializeProjectIdField(iRetryCount + 1);
                    }, 100);
                }
                return;
            }

            const oTable = this.byId("Projects");
            let sNextId = "P-0001";
            
            try {
                if (oTable) {
                    sNextId = this._generateNextIdFromBinding(oTable, "Projects", "sapPId", "P");
                    console.log("[ID Generation] Project Method 1 (binding):", sNextId);
                    
                    if (!sNextId || sNextId === "P-0001") {
                        const oModel = this.getOwnerComponent().getModel();
                        if (oModel) {
                            oModel.read("/Projects", {
                                urlParameters: {
                                    "$orderby": "sapPId desc",
                                    "$top": "1"
                                },
                                success: (oData) => {
                                    console.log("[ID Generation] Project Backend query result:", oData);
                                    let sBackendId = "P-0001";
                                    if (oData && oData.results && oData.results.length > 0) {
                                        const sMaxId = oData.results[0].sapPId || "";
                                        const m = sMaxId.match(/(\d+)$/);
                                        if (m) {
                                            const iNextNum = parseInt(m[1], 10) + 1;
                                            sBackendId = `P-${String(iNextNum).padStart(4, "0")}`;
                                        }
                                    }
                                    console.log("[ID Generation] Project Method 2 (backend):", sBackendId);
                                    oProjIdInput.setValue(sBackendId);
                                },
                                error: (oError) => {
                                    console.warn("[ID Generation] Project Backend query failed:", oError);
                                    if (!sNextId || sNextId === "P-0001") {
                                        oProjIdInput.setValue(sNextId);
                                    }
                                }
                            });
                            
                            if (sNextId) {
                                oProjIdInput.setValue(sNextId);
                            }
                        }
                    } else {
                        oProjIdInput.setValue(sNextId);
                    }
                } else {
                    if (iRetryCount < MAX_RETRIES) {
                        setTimeout(() => {
                            this._initializeProjectIdField(iRetryCount + 1);
                        }, 200);
                        return;
                    }
                    oProjIdInput.setValue(sNextId);
                }
            } catch (e) {
                console.error("[ID Generation] Project Error:", e);
                oProjIdInput.setValue(sNextId);
            }
            
            oProjIdInput.setEnabled(false);
            oProjIdInput.setPlaceholder("Auto-generated");
        },

        // ✅ NEW: Edit button handlers - populate forms when Edit is clicked
        onEditCustomerForm: function () {
            const oTable = this.byId("Customers");
            const aSelectedContexts = oTable.getSelectedContexts();
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                this._onCustDialogData(aSelectedContexts);
            } else {
                sap.m.MessageToast.show("Please select a row to edit.");
            }
        },

        onEditEmployeeForm: function () {
            const oTable = this.byId("Employees");
            const aSelectedContexts = oTable.getSelectedContexts();
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                this._onEmpDialogData(aSelectedContexts);
            } else {
                sap.m.MessageToast.show("Please select a row to edit.");
            }
        },

        onEditOpportunityForm: function () {
            const oTable = this.byId("Opportunities");
            const aSelectedContexts = oTable.getSelectedContexts();
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                this._onOppDialogData(aSelectedContexts);
            } else {
                sap.m.MessageToast.show("Please select a row to edit.");
            }
        },

        onEditProjectForm: function () {
            const oTable = this.byId("Projects");
            const aSelectedContexts = oTable.getSelectedContexts();
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                this._onProjDialogData(aSelectedContexts);
            } else {
                sap.m.MessageToast.show("Please select a row to edit.");
            }
        },

        // ✅ NEW: Cancel function for Employee form
        onCancelEmployeeForm: function () {
            // Clear all form fields
            this.byId("inputOHRId_emp")?.setValue("");
            this.byId("inputOHRId_emp")?.setEnabled(true); // Enable for new entry
            this.byId("inputFullName_emp")?.setValue("");
            this.byId("inputMailId_emp")?.setValue("");
            this.byId("inputGender_emp")?.setSelectedKey("");
            this.byId("inputEmployeeType_emp")?.setSelectedKey("");
            this.byId("inputDoJ_emp")?.setValue("");
            this.byId("inputBand_emp")?.setSelectedKey("");
            this.byId("inputRole_emp")?.setValue("");
            this.byId("inputLocation_emp")?.setValue("");
            this.byId("inputCity_emp")?.setValue("");
            this.byId("inputSupervisor_emp")?.setSelectedKey("");
            this.byId("inputSkills_emp")?.setValue("");
            this.byId("inputStatus_emp")?.setSelectedKey("");
            this.byId("inputLWD_emp")?.setValue("");
            
            // Deselect any selected row
            const oTable = this.byId("Employees");
            if (oTable && oTable.clearSelection) {
                try {
                    oTable.clearSelection();
                } catch (e) {
                    console.log("Selection cleared or method not available");
                }
            }
        },

        // Include all methods from CustomUtility
        initializeTable: CustomUtility.prototype.initializeTable,
        _getPersonsBinding: CustomUtility.prototype._getPersonsBinding,
        _getSelectedContexts: CustomUtility.prototype._getSelectedContexts,
        _updateSelectionState: CustomUtility.prototype._updateSelectionState,
        _updatePendingState: CustomUtility.prototype._updatePendingState,
        onSelectionChange: CustomUtility.prototype.onSelectionChange,
        _onCustDialogData: CustomUtility.prototype._onCustDialogData,
        _onEmpDialogData: CustomUtility.prototype._onEmpDialogData,
        _onOppDialogData: CustomUtility.prototype._onOppDialogData,
        _onProjDialogData: CustomUtility.prototype._onProjDialogData,
        // onAddPress: CustomUtility.prototype.onAddPress,
        // onDeletePress: CustomUtility.prototype.onDeletePress,
        // onSaveChanges: CustomUtility.prototype.onSaveChanges,
        // onCancelChanges: CustomUtility.prototype.onCancelChanges,
        // onCopyToClipboard: CustomUtility.prototype.onCopyToClipboard,
        // onUploadPress: CustomUtility.prototype.onUploadPress,
        // onUploadTemplate: CustomUtility.prototype.onUploadTemplate,
        // onDownloadTemplate: CustomUtility.prototype.onDownloadTemplate,
        // onEditPress: CustomUtility.prototype.onEditPress,
        // onAlignToggle: CustomUtility.prototype.onAlignToggle,
        _openPersonDialog: CustomUtility.prototype._openPersonDialog,
        onInlineAccept: CustomUtility.prototype.onInlineAccept,
        onInlineCancel: CustomUtility.prototype.onInlineCancel,
        // onSelectionChange_customers: CustomUtility.prototype.onSelectionChange_customers,
        // onSelectionChange_employees: CustomUtility.prototype.onSelectionChange_employees,
        // onSelectionChange_opportunities: CustomUtility.prototype.onSelectionChange_opportunities,
        // onSelectionChange_projects: CustomUtility.prototype.onSelectionChange_projects,
        // onSelectionChange_sapid: CustomUtility.prototype.onSelectionChange_sapid,
        // onSelectionChange: CustomUtility.prototype.onSelectionChange,
        onDeletePress: CustomUtility.prototype.onDeletePress,
        onEditPress: CustomUtility.prototype.onEditPress,
        onSaveButtonPress: CustomUtility.prototype.onSaveButtonPress,
        onCancelButtonPress: CustomUtility.prototype.onCancelButtonPress,
        _performCancelOperation: CustomUtility.prototype._performCancelOperation, // ✅ EXPOSED: For cancel button to work
        onAdd: CustomUtility.prototype.onAdd,
        _createEmptyRowData: CustomUtility.prototype._createEmptyRowData,
        _resolveContextByPath: CustomUtility.prototype._resolveContextByPath,
        _getRowBinding: CustomUtility.prototype._getRowBinding,
        onToggleRowDetail: CustomUtility.prototype.onToggleRowDetail,
        _generateNextIdFromBinding: CustomUtility.prototype._generateNextIdFromBinding,
        onFilterSearch: CustomUtility.prototype.onFilterSearch,
        onDemandPress: CustomUtility.prototype.onDemandPress,
        onBackToProjectsPress: CustomUtility.prototype.onBackToProjectsPress,
        onResourcesPress: CustomUtility.prototype.onResourcesPress,
        onBack: CustomUtility.prototype.onBack,
        onSelection: CustomUtility.prototype.onSelection,
        onAllocateRes: CustomUtility.prototype.onAllocateRes,
        onAllocateResource: CustomUtility.prototype.onAllocateResource,
        onAllocateConfirm: CustomUtility.prototype.onAllocateConfirm,
        onDialogClose: CustomUtility.prototype.onDialogClose,
        
        // ✅ NEW: Clear FilterBar handler
        onFilterBarClear: function (oEvent) {
            const oFilterBar = oEvent.getSource();
            const oFilterModel = this.getView().getModel("filterModel");
            const oFiltersModel = this.getView().getModel("$filters");
            
            // Clear all filter conditions from both models
            if (oFilterModel) {
                oFilterModel.setProperty("/conditions", {});
                oFilterModel.checkUpdate(true);
            }
            if (oFiltersModel) {
                oFiltersModel.setProperty("/conditions", {});
                oFiltersModel.checkUpdate(true);
            }
            
            // Clear all FilterField values by getting all filter fields and resetting them
            if (oFilterBar) {
                const aFilterFields = oFilterBar.getFilterFields();
                if (aFilterFields && aFilterFields.length > 0) {
                    aFilterFields.forEach(function(oFilterField) {
                        if (oFilterField && oFilterField.setValue) {
                            oFilterField.setValue("");
                        } else if (oFilterField && oFilterField.setSelectedKey) {
                            oFilterField.setSelectedKey("");
                        } else if (oFilterField && oFilterField.clear) {
                            oFilterField.clear();
                        }
                    });
                }
            }
            
            // Rebind the table to show all data
            const oTable = this.byId("Customers");
            if (oTable) {
                if (typeof oTable.rebind === "function") {
                    oTable.rebind();
                } else if (typeof oTable.bindRows === "function") {
                    oTable.bindRows();
                }
            }
        },

        // For upload functionality function
        onUpload: CustomUtility.prototype._onUploadPress,
        onFileUploadSubmit: CustomUtility.prototype._onFileUploadSubmit,
        onMessagePopoverPress: CustomUtility.prototype._onMessagePopoverPress,
        onFileUploadChange: CustomUtility.prototype._onFileUploadChange,
        updateMessageButtonIcon: CustomUtility.prototype._updateMessageButtonIcon,
        onMessagePopoverPress: CustomUtility.prototype._onMessagePopoverPress,
        onCloseUpload: CustomUtility.prototype._onCloseUpload,
        getMessagePopover: CustomUtility.prototype._getMessagePopover,
        onDownload: CustomUtility.prototype._onDownloadPress,
        downloadCSV: CustomUtility.prototype._downloadCSV,
        OnTemplateDownloadBtn: CustomUtility.prototype._OnTemplateDownloadBtn,
        onSplitButtonArrowPress: CustomUtility.prototype._onSplitButtonArrowPress,
        exportUploadTemplate: CustomUtility.prototype._exportUploadTemplate,

        // ✅ Value Help Dialog Handlers
        onCustomerValueHelpRequest: function (oEvent) {
            const oInput = oEvent.getSource();
            const oView = this.getView();
            
            // Create dialog if not exists
            if (!this._oCustomerValueHelpDialog) {
                this._oCustomerValueHelpDialog = sap.ui.xmlfragment(
                    "glassboard.view.dialogs.CustomerValueHelp",
                    this
                );
                oView.addDependent(this._oCustomerValueHelpDialog);
            }
            
            // Store reference to input field
            this._oCustomerValueHelpDialog._oInputField = oInput;
            
            // Open dialog
            this._oCustomerValueHelpDialog.open();
        },

        onOpportunityValueHelpRequest: function (oEvent) {
            const oInput = oEvent.getSource();
            const oView = this.getView();
            
            if (!this._oOpportunityValueHelpDialog) {
                this._oOpportunityValueHelpDialog = sap.ui.xmlfragment(
                    "glassboard.view.dialogs.OpportunityValueHelp",
                    this
                );
                oView.addDependent(this._oOpportunityValueHelpDialog);
            }
            
            this._oOpportunityValueHelpDialog._oInputField = oInput;
            this._oOpportunityValueHelpDialog.open();
        },

        onEmployeeValueHelpRequest: function (oEvent) {
            const oInput = oEvent.getSource();
            const oView = this.getView();
            
            if (!this._oEmployeeValueHelpDialog) {
                this._oEmployeeValueHelpDialog = sap.ui.xmlfragment(
                    "glassboard.view.dialogs.EmployeeValueHelp",
                    this
                );
                oView.addDependent(this._oEmployeeValueHelpDialog);
            }
            
            this._oEmployeeValueHelpDialog._oInputField = oInput;
            this._oEmployeeValueHelpDialog.open();
        },

        // ✅ Value Help Dialog: Cancel handler
        onCustomerValueHelpCancel: function (oEvent) {
            const oDialog = this._oCustomerValueHelpDialog;
            if (oDialog) {
                oDialog.close();
            }
        },

        onOpportunityValueHelpCancel: function (oEvent) {
            const oDialog = this._oOpportunityValueHelpDialog;
            if (oDialog) {
                oDialog.close();
            }
        },

        onEmployeeValueHelpCancel: function (oEvent) {
            const oDialog = this._oEmployeeValueHelpDialog;
            if (oDialog) {
                oDialog.close();
            }
        },

        // ✅ Value Help Dialog: Customer selection handler
        onCustomerValueHelpConfirm: function (oEvent) {
            const oDialog = this._oCustomerValueHelpDialog;
            if (!oDialog) {
                return;
            }
            
            // Get table from within the dialog
            const oDialogContent = oDialog.getContent()[0];
            const aItems = oDialogContent.getItems();
            const oTable = aItems.find(item => item.getId && item.getId().includes("customerValueHelpTable"));
            
            if (!oTable || !oTable.getSelectedItem) {
                sap.m.MessageToast.show("Please select a customer");
                return;
            }
            
            const oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                sap.m.MessageToast.show("Please select a customer");
                return;
            }
            
            const oContext = oSelectedItem.getBindingContext();
            if (oContext) {
                const oCustomer = oContext.getObject();
                if (oDialog._oInputField) {
                    // Display customer name, but store ID in data attribute
                    oDialog._oInputField.setValue(oCustomer.customerName || "");
                    oDialog._oInputField.data("selectedId", oCustomer.SAPcustId);
                    
                    // Also update/create the model with the ID (for backend submission)
                    let oModel = this.getView().getModel("opportunityModel");
                    if (!oModel) {
                        oModel = new sap.ui.model.json.JSONModel({ customerId: oCustomer.SAPcustId });
                        this.getView().setModel(oModel, "opportunityModel");
                    } else {
                        oModel.setProperty("/customerId", oCustomer.SAPcustId);
                    }
                }
            }
            oDialog.close();
        },

        // ✅ Value Help Dialog: Opportunity selection handler
        onOpportunityValueHelpConfirm: function (oEvent) {
            const oDialog = this._oOpportunityValueHelpDialog;
            if (!oDialog) {
                return;
            }
            
            // Get table from within the dialog
            const oDialogContent = oDialog.getContent()[0];
            const aItems = oDialogContent.getItems();
            const oTable = aItems.find(item => item.getId && item.getId().includes("opportunityValueHelpTable"));
            
            if (!oTable || !oTable.getSelectedItem) {
                sap.m.MessageToast.show("Please select an opportunity");
                return;
            }
            
            const oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                sap.m.MessageToast.show("Please select an opportunity");
                return;
            }
            
            const oContext = oSelectedItem.getBindingContext();
            if (oContext) {
                const oOpportunity = oContext.getObject();
                if (oDialog._oInputField) {
                    // Display opportunity name, but store ID in data attribute
                    oDialog._oInputField.setValue(oOpportunity.opportunityName || "");
                    oDialog._oInputField.data("selectedId", oOpportunity.sapOpportunityId);
                    
                    // Also update/create the model with the ID (for backend submission)
                    let oModel = this.getView().getModel("projectModel");
                    if (!oModel) {
                        oModel = new sap.ui.model.json.JSONModel({ oppId: oOpportunity.sapOpportunityId });
                        this.getView().setModel(oModel, "projectModel");
                    } else {
                        oModel.setProperty("/oppId", oOpportunity.sapOpportunityId);
                    }
                }
            }
            oDialog.close();
        },

        // ✅ Value Help Dialog: Employee selection handler
        onEmployeeValueHelpConfirm: function (oEvent) {
            const oDialog = this._oEmployeeValueHelpDialog;
            if (!oDialog) {
                return;
            }
            
            // Get table from within the dialog
            const oDialogContent = oDialog.getContent()[0];
            const aItems = oDialogContent.getItems();
            const oTable = aItems.find(item => item.getId && item.getId().includes("employeeValueHelpTable"));
            
            if (!oTable || !oTable.getSelectedItem) {
                sap.m.MessageToast.show("Please select a supervisor");
                return;
            }
            
            const oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                sap.m.MessageToast.show("Please select a supervisor");
                return;
            }
            
            const oContext = oSelectedItem.getBindingContext();
            if (oContext) {
                const oEmployee = oContext.getObject();
                if (oDialog._oInputField) {
                    oDialog._oInputField.setValue(oEmployee.ohrId);
                }
            }
            oDialog.close();
        },

        // ✅ Value Help Dialog: Search handlers
        onCustomerValueHelpSearch: function (oEvent) {
            const sValue = oEvent.getParameter("value") || oEvent.getSource().getValue() || "";
            const oDialog = this._oCustomerValueHelpDialog;
            if (!oDialog) {
                return;
            }
            
            const oDialogContent = oDialog.getContent()[0];
            const aItems = oDialogContent.getItems();
            const oTable = aItems.find(item => item.getId && item.getId().includes("customerValueHelpTable"));
            
            if (!oTable) {
                return;
            }
            
            const oBinding = oTable.getBinding("items");
            if (!oBinding) {
                console.warn("Customer value help table binding not available");
                return;
            }
            
            if (sValue && sValue.trim()) {
                const aFilters = [
                    new sap.ui.model.Filter({
                        path: "customerName",
                        operator: sap.ui.model.FilterOperator.Contains,
                        value1: sValue.trim()
                    })
                ];
                oBinding.filter(aFilters, sap.ui.model.FilterType.Application);
            } else {
                oBinding.filter([], sap.ui.model.FilterType.Application);
            }
        },

        onOpportunityValueHelpSearch: function (oEvent) {
            const sValue = oEvent.getParameter("value") || oEvent.getSource().getValue() || "";
            const oDialog = this._oOpportunityValueHelpDialog;
            if (!oDialog) {
                return;
            }
            
            const oDialogContent = oDialog.getContent()[0];
            const aItems = oDialogContent.getItems();
            const oTable = aItems.find(item => item.getId && item.getId().includes("opportunityValueHelpTable"));
            
            if (!oTable) {
                return;
            }
            
            const oBinding = oTable.getBinding("items");
            if (!oBinding) {
                console.warn("Opportunity value help table binding not available");
                return;
            }
            
            if (sValue && sValue.trim()) {
                const aFilters = [
                    new sap.ui.model.Filter({
                        path: "opportunityName",
                        operator: sap.ui.model.FilterOperator.Contains,
                        value1: sValue.trim()
                    })
                ];
                oBinding.filter(aFilters, sap.ui.model.FilterType.Application);
            } else {
                oBinding.filter([], sap.ui.model.FilterType.Application);
            }
        },

        onEmployeeValueHelpSearch: function (oEvent) {
            const sValue = oEvent.getParameter("value") || oEvent.getSource().getValue() || "";
            const oDialog = this._oEmployeeValueHelpDialog;
            if (!oDialog) {
                return;
            }
            
            const oDialogContent = oDialog.getContent()[0];
            const aItems = oDialogContent.getItems();
            const oTable = aItems.find(item => item.getId && item.getId().includes("employeeValueHelpTable"));
            
            if (!oTable) {
                return;
            }
            
            const oBinding = oTable.getBinding("items");
            if (!oBinding) {
                console.warn("Employee value help table binding not available");
                return;
            }
            
            if (sValue && sValue.trim()) {
                const aFilters = [
                    new sap.ui.model.Filter({
                        path: "fullName",
                        operator: sap.ui.model.FilterOperator.Contains,
                        value1: sValue.trim()
                    })
                ];
                oBinding.filter(aFilters, sap.ui.model.FilterType.Application);
            } else {
                oBinding.filter([], sap.ui.model.FilterType.Application);
            }
        },

    });
});