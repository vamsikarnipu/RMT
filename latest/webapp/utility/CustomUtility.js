
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/mdc/p13n/StateUtil",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
], function (Controller, StateUtil, JSONModel,Fragment, MessageToast) {
    "use strict";

    // Fixed syntax error - removed duplicate oData declarations
    // Force refresh to clear browser cache

    return Controller.extend("glassboard.utility.CustomUtility", {
        onInit: function () {

            console.log("=== [Controller] onInit called ===");

            const oModel = this.getOwnerComponent().getModel();
            this.getView().setModel(oModel);


            // Lightweight view state model for button enablement
            const oViewState = new JSONModel({ hasSelected: false, hasPendingChanges: false });
            this.getView().setModel(oViewState, "model");
            // ✅ FIXED: Model to track row-level inline editing - TABLE-SCOPED
            // Each table has its own edit state to prevent cross-table interference
            const oEditModel = new JSONModel({
                Customers: { editingPath: "", mode: null },
                Employees: { editingPath: "", mode: null },
                Opportunities: { editingPath: "", mode: null },
                Projects: { editingPath: "", mode: null },
                SAPIdStatuses: { editingPath: "", mode: null },
                // ✅ REMOVED: Verticals: { editingPath: "", mode: null }, (Vertical is now an enum)
                currentTable: null  // Track which table is currently being edited
            });
            this.getView().setModel(oEditModel, "edit");
            // -------------------------------------------------------------
            const oMessageManager = sap.ui.getCore().getMessageManager();
            const oMessageModel = oMessageManager.getMessageModel();
            this.getView().setModel(oMessageModel, "message");
            oMessageManager.registerObject(this.getView(), true);

            const oBinding = oMessageModel.bindList("/");
            oBinding.attachChange(() => {
                this.updateMessageButtonIcon(this);
            });
            this.updateMessageButtonIcon(this);

            // -------------------------------------------------------------
            // 4. Footer Button Handling
            // -------------------------------------------------------------
            const oFooterButton = this.byId("uploadLogButton");
            if (oFooterButton) {
                const oButtonBinding = oFooterButton.getBinding("visible");
                if (oButtonBinding) {
                    oButtonBinding.attachChange(() => {
                        if (oFooterButton.getVisible()) {
                            this.onCloseUpload();
                            const oFileUploader = this.byId("fileUploader");
                            if (oFileUploader) oFileUploader.clear();
                            this._csvPayload = null;
                        }
                    });
                }
            }
        },

        // Initialize table-specific functionality when table is available
        initializeTable: function (sTableId) {
            // Try different table IDs if not specified
            const aTableIds = sTableId ? [sTableId] : ["Customers", "Opportunities", "Projects", "SAPIdStatuses", "Employees"];
            let oTable = null;

            for (const sId of aTableIds) {
                oTable = this.byId(sId);
                if (oTable) {
                    console.log("[Controller] Found table:", sId);
                    break;
                }
            }

            if (!oTable) {
                console.warn("[Controller] No table found, skipping initialization");
                return;
            }

            console.log("[Controller] Starting table initialization");

            // Wait for table initialization
            oTable.initialized().then(() => {
                console.log("[Controller] Table initialized");

                // Get the delegate
                const oDelegate = oTable.getControlDelegate();

                // Build initial state using delegate properties to align with MDC p13n
                oDelegate.fetchProperties(oTable)
                    .then((aProperties) => {
                        console.log("[Controller] Properties fetched:", aProperties);

                        // Prepare items for external state (visible true for all non-$ props)
                        const aItems = aProperties
                            .filter((p) => !p.name || !String(p.name).startsWith("$"))
                            .map((p) => ({
                                name: p.name || p.path,
                                visible: true
                            }));

                        const oExternalState = { items: aItems };

                        return StateUtil.applyExternalState(oTable, oExternalState);
                    })
                    .then(() => {
                        console.log("[Controller] External state applied; rebinding table");
                        // Ensure actions column exists for inline accept/cancel
                        const oDelegateAgain = oTable.getControlDelegate();
                        // Avoid duplicates by ID
                        if (!oTable.getColumns().some(function (c) { return c.getId && c.getId().endsWith("--col-actions"); })) {
                            oDelegateAgain.addItem(oTable, "_actions").then(function (oCol) {
                                oTable.addColumn(oCol);
                                oTable.rebind();
                            }).catch(function () { oTable.rebind(); });
                        } else {
                            oTable.rebind();
                        }
                    })
                    .catch((err) => {
                        console.error("[Controller] Error during initial column setup:", err);
                    });

                // Keep selection state in sync
                oTable.attachSelectionChange(this._updateSelectionState, this);
            });

            // Track pending changes on default model
            const oModel = this.getOwnerComponent().getModel();
            if (oModel && oModel.attachPropertyChange) {
                oModel.attachPropertyChange(this._updatePendingState, this);
            }
        },

        // Utilities
        _getPersonsBinding: function () {
            const oTable = this.byId("Customers");
            return oTable && oTable.getRowBinding && oTable.getRowBinding();
        },

        _getSelectedContexts: function () {
            const oTable = this.byId("Customers");
            return (oTable && oTable.getSelectedContexts) ? oTable.getSelectedContexts() : [];
        },

        _updateSelectionState: function () {
            const bHasSelection = this._getSelectedContexts().length > 0;
            this.getView().getModel("model").setProperty("/hasSelected", bHasSelection);
        },

        _updatePendingState: function () {
            const oModel = this.getOwnerComponent().getModel();
            const bHasChanges = !!(oModel && oModel.hasPendingChanges && oModel.hasPendingChanges());
            this.getView().getModel("model").setProperty("/hasPendingChanges", bHasChanges);
        },

        // Toolbar actions

        // //on selection change functionalities.
        onSelectionChange: function (oEvent) {
            const oTable = oEvent.getSource();
            const sTableId = oTable.getId().split("--").pop(); // Extract ID without view prefix

            const buttonMap = {
                "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus" },
                "Employees": { edit: "Edit_emp", delete: "Delete_emp" },
                "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr" },
                "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj" },
                "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap" },
                "Allocations":{ demand: "demand_alloc"},
                "Demands":{resources: "Resources_demand"},
                "Resources":{allocate: "btnResourceAllocate"},
                "Res": {allocateRes: "btnResAllocate"}
                // ✅ REMOVED: "Verticals": { edit: "btnEdit_vert", delete: "btnDelete_vert" }
            };

            const config = buttonMap[sTableId];
            if (!config) {
                console.warn("No button mapping found for table:", sTableId);
                return;
            }

            const aSelectedContexts = oTable.getSelectedContexts();
            const bHasSelection = aSelectedContexts.length > 0;

            // ✅ NEW: Don't auto-populate forms on selection - user must click Edit button
            // Only clear form if no selection
            if (!bHasSelection) {
                // No selection - clear form
                if (sTableId === "Customers") {
                    this._onCustDialogData([]);
                } else if (sTableId === "Employees") {
                    this._onEmpDialogData([]);
                } else if (sTableId === "Opportunities") {
                    this._onOppDialogData([]);
                } else if (sTableId === "Projects") {
                    this._onProjDialogData([]);
                }
            }

            // Enable Edit button in form (not table toolbar edit button)
            if (sTableId === "Customers") {
                this.byId("editButton_cus")?.setEnabled(bHasSelection);
            } else if (sTableId === "Employees") {
                this.byId("editButton_emp")?.setEnabled(bHasSelection);
            } else if (sTableId === "Opportunities") {
                this.byId("editButton_oppr")?.setEnabled(bHasSelection);
            } else if (sTableId === "Projects") {
                this.byId("editButton_proj")?.setEnabled(bHasSelection);
            }

            // Only enable edit/delete in table toolbar if they exist (some tables might not have them)
            if (config.edit) {
                this.byId(config.edit)?.setEnabled(bHasSelection);
            }
            if (config.delete) {
                this.byId(config.delete)?.setEnabled(bHasSelection);
            }
             this.byId(config.demand)?.setEnabled(bHasSelection);
             this.byId(config.resources)?.setEnabled(bHasSelection);
             this.byId(config.allocate)?.setEnabled(bHasSelection);
             this.byId(config.allocateRes)?.setEnabled(bHasSelection);

        },

        /**
         * 
         */
        // ✅ NEW: Employee form data handler
        _onEmpDialogData: function (aSelectedContexts) {
            if (!aSelectedContexts || aSelectedContexts.length === 0) {
                // No selection - clear form for new entry
                const oTable = this.byId("Employees");
                let sNextId = ""; // Employees might not have auto-generated IDs
                try {
                    // For now, just clear - Employees might use manual OHR IDs
                    sNextId = "";
                } catch (e) {
                    console.log("Could not generate next Employee ID");
                }
                
                this.byId("inputOHRId_emp")?.setValue(sNextId);
                this.byId("inputOHRId_emp")?.setEnabled(true); // Employees might need manual OHR ID entry
                this.byId("inputFullName_emp")?.setValue("");
                this.byId("inputMailId_emp")?.setValue("");
                this.byId("inputGender_emp")?.setSelectedKey("");
                this.byId("inputEmployeeType_emp")?.setSelectedKey("");
                this.byId("inputDoJ_emp")?.setValue("");
                this.byId("inputBand_emp")?.setSelectedKey("");
                this.byId("inputRole_emp")?.setValue("");
                this.byId("inputLocation_emp")?.setValue("");
                this.byId("inputCity_emp")?.setValue("");
                this.byId("inputSupervisor_emp")?.setValue("");
                this.byId("inputSkills_emp")?.setValue("");
                this.byId("inputStatus_emp")?.setSelectedKey("");
                this.byId("inputLWD_emp")?.setValue("");
                return;
            }
            
            // Row selected - populate form for update
            let oObj = aSelectedContexts[0].getObject();
            this.byId("inputOHRId_emp")?.setValue(oObj.ohrId || "");
            this.byId("inputOHRId_emp")?.setEnabled(false); // Disable OHR ID in update mode (key field)
            this.byId("inputFullName_emp")?.setValue(oObj.fullName || "");
            this.byId("inputMailId_emp")?.setValue(oObj.mailid || "");
            this.byId("inputGender_emp")?.setSelectedKey(oObj.gender || "");
            this.byId("inputEmployeeType_emp")?.setSelectedKey(oObj.employeeType || "");
            this.byId("inputDoJ_emp")?.setValue(oObj.doj || "");
            this.byId("inputBand_emp")?.setSelectedKey(oObj.band || "");
            this.byId("inputRole_emp")?.setValue(oObj.role || "");
            this.byId("inputLocation_emp")?.setValue(oObj.location || "");
            this.byId("inputCity_emp")?.setValue(oObj.city || "");
            this.byId("inputSupervisor_emp")?.setValue(oObj.supervisorOHR || "");
            this.byId("inputSkills_emp")?.setValue(oObj.skills || "");
            this.byId("inputStatus_emp")?.setSelectedKey(oObj.status || "");
            this.byId("inputLWD_emp")?.setValue(oObj.lwd || "");
        },

        // ✅ NEW: Opportunity form data handler
        _onOppDialogData: function (aSelectedContexts) {
            if (!aSelectedContexts || aSelectedContexts.length === 0) {
                // No selection - clear form for new entry
                const oTable = this.byId("Opportunities");
                let sNextId = "O-0001"; // Default
                try {
                    // Try to generate next ID from existing data
                    if (oTable) {
                        sNextId = this._generateNextIdFromBinding(oTable, "Opportunities", "sapOpportunityId", "O") || sNextId;
                    }
                } catch (e) {
                    console.log("Could not generate next Opportunity ID, using default:", sNextId);
                }
                
                this.byId("inputSapOppId_oppr")?.setValue(sNextId);
                this.byId("inputSapOppId_oppr")?.setEnabled(false); // Always disabled - auto-generated
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
                this.byId("inputCustomerId_oppr")?.data("selectedId", "");
                return;
            }
            
            // Row selected - populate form for update
            // ✅ Use EXACT same simple approach as Customer and Employee (which are working perfectly)
            let oObj = aSelectedContexts[0].getObject();
            
            this.byId("inputSapOppId_oppr")?.setValue(oObj.sapOpportunityId || "");
            this.byId("inputSapOppId_oppr")?.setEnabled(false); // Disable in update mode
            this.byId("inputSapOppId_oppr")?.setPlaceholder("");
            this.byId("inputSfdcOppId_oppr")?.setValue(oObj.sfdcOpportunityId || "");
            this.byId("inputOppName_oppr")?.setValue(oObj.opportunityName || "");
            this.byId("inputBusinessUnit_oppr")?.setValue(oObj.businessUnit || "");
            this.byId("inputProbability_oppr")?.setSelectedKey(oObj.probability || "ProposalStage");
            this.byId("inputStage_oppr")?.setSelectedKey(oObj.Stage || "Discover");
            this.byId("inputSalesSPOC_oppr")?.setValue(oObj.salesSPOC || "");
            this.byId("inputDeliverySPOC_oppr")?.setValue(oObj.deliverySPOC || "");
            this.byId("inputExpectedStart_oppr")?.setValue(oObj.expectedStart || "");
            this.byId("inputExpectedEnd_oppr")?.setValue(oObj.expectedEnd || "");
            // ✅ Convert numeric field to string for Input control
            this.byId("inputTCV_oppr")?.setValue(oObj.tcv != null ? String(oObj.tcv) : "");
            // For customer field - use same simple approach as Employee supervisor field
            const sCustomerId = oObj.customerId || "";
            if (sCustomerId) {
                // ✅ FIRST: Try to get name from expanded association (if available)
                if (oObj.to_Customer && oObj.to_Customer.customerName) {
                    this.byId("inputCustomerId_oppr")?.setValue(oObj.to_Customer.customerName);
                } else {
                    // If association not expanded, just set the ID (will be resolved by value help)
                    this.byId("inputCustomerId_oppr")?.setValue(sCustomerId);
                }
                this.byId("inputCustomerId_oppr")?.data("selectedId", sCustomerId);
                // Update model for backend submission
                let oOppModel = this.getView().getModel("opportunityModel");
                if (!oOppModel) {
                    oOppModel = new sap.ui.model.json.JSONModel({ customerId: sCustomerId });
                    this.getView().setModel(oOppModel, "opportunityModel");
                } else {
                    oOppModel.setProperty("/customerId", sCustomerId);
                }
            } else {
                this.byId("inputCustomerId_oppr")?.setValue("");
                this.byId("inputCustomerId_oppr")?.data("selectedId", "");
            }
        },
        
        // Helper to load customer name for opportunity field
        _loadCustomerNameForOpportunity: function(sCustomerId) {
            const oModel = this.getView().getModel();
            if (oModel) {
                const oCustomerContext = oModel.bindContext(`/Customers('${sCustomerId}')`);
                oCustomerContext.execute()
                    .then(() => {
                        const oCustomer = oCustomerContext.getObject();
                        if (oCustomer && this.byId("inputCustomerId_oppr")) {
                            this.byId("inputCustomerId_oppr").setValue(oCustomer.customerName || "");
                            this.byId("inputCustomerId_oppr").data("selectedId", sCustomerId);
                            // Also update/create model with the ID (for backend submission)
                            let oOppModel = this.getView().getModel("opportunityModel");
                            if (!oOppModel) {
                                oOppModel = new sap.ui.model.json.JSONModel({ customerId: sCustomerId });
                                this.getView().setModel(oOppModel, "opportunityModel");
                            } else {
                                oOppModel.setProperty("/customerId", sCustomerId);
                            }
                        }
                    })
                    .catch((oError) => {
                        console.log("Error loading customer name:", oError);
                        // Fallback: try to read from Customers collection
                        const oCustomersBinding = oModel.bindList("/Customers");
                        oCustomersBinding.attachEventOnce("dataReceived", () => {
                            const aCustomers = oCustomersBinding.getContexts().map(ctx => ctx.getObject());
                            const oCustomer = aCustomers.find(c => c.SAPcustId === sCustomerId);
                            if (oCustomer && this.byId("inputCustomerId_oppr")) {
                                this.byId("inputCustomerId_oppr").setValue(oCustomer.customerName || "");
                                this.byId("inputCustomerId_oppr").data("selectedId", sCustomerId);
                                // Also update/create model with the ID (for backend submission)
                                let oOppModel = this.getView().getModel("opportunityModel");
                                if (!oOppModel) {
                                    oOppModel = new sap.ui.model.json.JSONModel({ customerId: sCustomerId });
                                    this.getView().setModel(oOppModel, "opportunityModel");
                                } else {
                                    oOppModel.setProperty("/customerId", sCustomerId);
                                }
                            }
                        });
                        // Trigger data loading
                        oCustomersBinding.refresh();
                    });
            }
        },
        
        // Helper function for retry case (kept for backward compatibility)
        _populateOpportunityFormDirect: function(oObj) {
            if (!oObj) return;
            this.byId("inputSapOppId_oppr")?.setValue(oObj.sapOpportunityId || "");
            this.byId("inputSapOppId_oppr")?.setEnabled(false);
            this.byId("inputSapOppId_oppr")?.setPlaceholder("");
            this.byId("inputSfdcOppId_oppr")?.setValue(oObj.sfdcOpportunityId || "");
            this.byId("inputOppName_oppr")?.setValue(oObj.opportunityName || "");
            this.byId("inputBusinessUnit_oppr")?.setValue(oObj.businessUnit || "");
            this.byId("inputProbability_oppr")?.setSelectedKey(oObj.probability || "ProposalStage");
            this.byId("inputStage_oppr")?.setSelectedKey(oObj.Stage || "Discover");
            this.byId("inputSalesSPOC_oppr")?.setValue(oObj.salesSPOC || "");
            this.byId("inputDeliverySPOC_oppr")?.setValue(oObj.deliverySPOC || "");
            this.byId("inputExpectedStart_oppr")?.setValue(oObj.expectedStart || "");
            this.byId("inputExpectedEnd_oppr")?.setValue(oObj.expectedEnd || "");
            this.byId("inputTCV_oppr")?.setValue(oObj.tcv || "");
            
            // Handle customer field
            const sCustomerId = oObj.customerId || "";
            if (sCustomerId) {
                if (oObj.to_Customer && oObj.to_Customer.customerName) {
                    this.byId("inputCustomerId_oppr")?.setValue(oObj.to_Customer.customerName);
                    this.byId("inputCustomerId_oppr")?.data("selectedId", sCustomerId);
                    let oOppModel = this.getView().getModel("opportunityModel");
                    if (!oOppModel) {
                        oOppModel = new sap.ui.model.json.JSONModel({ customerId: sCustomerId });
                        this.getView().setModel(oOppModel, "opportunityModel");
                    } else {
                        oOppModel.setProperty("/customerId", sCustomerId);
                    }
                } else {
                    this.byId("inputCustomerId_oppr")?.setValue(sCustomerId);
                    this.byId("inputCustomerId_oppr")?.data("selectedId", sCustomerId);
                }
            } else {
                this.byId("inputCustomerId_oppr")?.setValue("");
                this.byId("inputCustomerId_oppr")?.data("selectedId", "");
            }
        },

        // ✅ NEW: Project form data handler
        _onProjDialogData: function (aSelectedContexts) {
            if (!aSelectedContexts || aSelectedContexts.length === 0) {
                // No selection - clear form for new entry
                const oTable = this.byId("Projects");
                let sNextId = "P-0001"; // Default
                try {
                    // Try to generate next ID from existing data
                    if (oTable) {
                        sNextId = this._generateNextIdFromBinding(oTable, "Projects", "sapPId", "P") || sNextId;
                    }
                } catch (e) {
                    console.log("Could not generate next Project ID, using default:", sNextId);
                }
                
                this.byId("inputSapProjId_proj")?.setValue(sNextId);
                this.byId("inputSapProjId_proj")?.setEnabled(false); // Always disabled - auto-generated
                this.byId("inputSapProjId_proj")?.setPlaceholder("Auto-generated");
                this.byId("inputSfdcProjId_proj")?.setValue("");
                this.byId("inputProjectName_proj")?.setValue("");
                this.byId("inputStartDate_proj")?.setValue("");
                this.byId("inputEndDate_proj")?.setValue("");
                this.byId("inputGPM_proj")?.setValue("");
                this.byId("inputProjectType_proj")?.setSelectedKey("FixedPrice");
                this.byId("inputStatus_proj")?.setSelectedKey("Planned");
                this.byId("inputOppId_proj")?.setValue("");
                this.byId("inputOppId_proj")?.data("selectedId", "");
                this.byId("inputRequiredResources_proj")?.setValue("");
                this.byId("inputAllocatedResources_proj")?.setValue("");
                this.byId("inputToBeAllocated_proj")?.setValue("");
                this.byId("inputSOWReceived_proj")?.setSelectedKey("No");
                this.byId("inputPOReceived_proj")?.setSelectedKey("No");
                return;
            }
            
            // Row selected - populate form for update
            // ✅ Use EXACT same simple approach as Customer and Employee (which are working perfectly)
            let oObj = aSelectedContexts[0].getObject();
            
            this.byId("inputSapProjId_proj")?.setValue(oObj.sapPId || "");
            this.byId("inputSapProjId_proj")?.setEnabled(false); // Disable in update mode
            this.byId("inputSapProjId_proj")?.setPlaceholder("");
            this.byId("inputSfdcProjId_proj")?.setValue(oObj.sfdcPId || "");
            this.byId("inputProjectName_proj")?.setValue(oObj.projectName || "");
            this.byId("inputStartDate_proj")?.setValue(oObj.startDate || "");
            this.byId("inputEndDate_proj")?.setValue(oObj.endDate || "");
            // ✅ Convert numeric fields to strings for Input controls
            this.byId("inputGPM_proj")?.setValue(oObj.gpm != null ? String(oObj.gpm) : "");
            this.byId("inputProjectType_proj")?.setSelectedKey(oObj.projectType || "FixedPrice");
            this.byId("inputStatus_proj")?.setSelectedKey(oObj.status || "Planned");
            this.byId("inputRequiredResources_proj")?.setValue(oObj.requiredResources != null ? String(oObj.requiredResources) : "");
            this.byId("inputAllocatedResources_proj")?.setValue(oObj.allocatedResources != null ? String(oObj.allocatedResources) : "");
            this.byId("inputToBeAllocated_proj")?.setValue(oObj.toBeAllocated != null ? String(oObj.toBeAllocated) : "");
            this.byId("inputSOWReceived_proj")?.setSelectedKey(oObj.SOWReceived || "No");
            this.byId("inputPOReceived_proj")?.setSelectedKey(oObj.POReceived || "No");
            // For opportunity field - use same simple approach as Employee supervisor field
            const sOppId = oObj.oppId || "";
            if (sOppId) {
                // ✅ FIRST: Try to get name from expanded association (if available)
                if (oObj.to_Opportunity && oObj.to_Opportunity.opportunityName) {
                    this.byId("inputOppId_proj")?.setValue(oObj.to_Opportunity.opportunityName);
                } else {
                    // If association not expanded, just set the ID (will be resolved by value help)
                    this.byId("inputOppId_proj")?.setValue(sOppId);
                }
                this.byId("inputOppId_proj")?.data("selectedId", sOppId);
                // Update model for backend submission
                let oProjModel = this.getView().getModel("projectModel");
                if (!oProjModel) {
                    oProjModel = new sap.ui.model.json.JSONModel({ oppId: sOppId });
                    this.getView().setModel(oProjModel, "projectModel");
                } else {
                    oProjModel.setProperty("/oppId", sOppId);
                }
            } else {
                this.byId("inputOppId_proj")?.setValue("");
                this.byId("inputOppId_proj")?.data("selectedId", "");
            }
        },
        
        // Helper to load opportunity name for project field
        _loadOpportunityNameForProject: function(sOppId) {
            const oModel = this.getView().getModel();
            if (oModel) {
                const oOppContext = oModel.bindContext(`/Opportunities('${sOppId}')`);
                oOppContext.execute()
                    .then(() => {
                        const oOpportunity = oOppContext.getObject();
                        if (oOpportunity && this.byId("inputOppId_proj")) {
                            this.byId("inputOppId_proj").setValue(oOpportunity.opportunityName || "");
                            this.byId("inputOppId_proj").data("selectedId", sOppId);
                            // Also update/create model with the ID (for backend submission)
                            let oProjModel = this.getView().getModel("projectModel");
                            if (!oProjModel) {
                                oProjModel = new sap.ui.model.json.JSONModel({ oppId: sOppId });
                                this.getView().setModel(oProjModel, "projectModel");
                            } else {
                                oProjModel.setProperty("/oppId", sOppId);
                            }
                        }
                    })
                    .catch((oError) => {
                        console.log("Error loading opportunity name:", oError);
                        // Fallback: try to read from Opportunities collection
                        const oOppsBinding = oModel.bindList("/Opportunities");
                        oOppsBinding.attachEventOnce("dataReceived", () => {
                            const aOpportunities = oOppsBinding.getContexts().map(ctx => ctx.getObject());
                            const oOpportunity = aOpportunities.find(o => o.sapOpportunityId === sOppId);
                            if (oOpportunity && this.byId("inputOppId_proj")) {
                                this.byId("inputOppId_proj").setValue(oOpportunity.opportunityName || "");
                                this.byId("inputOppId_proj").data("selectedId", sOppId);
                                // Also update/create model with the ID (for backend submission)
                                let oProjModel = this.getView().getModel("projectModel");
                                if (!oProjModel) {
                                    oProjModel = new sap.ui.model.json.JSONModel({ oppId: sOppId });
                                    this.getView().setModel(oProjModel, "projectModel");
                                } else {
                                    oProjModel.setProperty("/oppId", sOppId);
                                }
                            }
                        });
                        // Trigger data loading
                        oOppsBinding.refresh();
                    });
            }
        },
        
        // Helper function for retry case
        _populateProjectFormDirect: function(oObj) {
            if (!oObj) return;
            this.byId("inputSapProjId_proj")?.setValue(oObj.sapPId || "");
            this.byId("inputSapProjId_proj")?.setEnabled(false);
            this.byId("inputSapProjId_proj")?.setPlaceholder("");
            this.byId("inputSfdcProjId_proj")?.setValue(oObj.sfdcPId || "");
            this.byId("inputProjectName_proj")?.setValue(oObj.projectName || "");
            this.byId("inputStartDate_proj")?.setValue(oObj.startDate || "");
            this.byId("inputEndDate_proj")?.setValue(oObj.endDate || "");
            this.byId("inputGPM_proj")?.setValue(oObj.gpm || "");
            this.byId("inputProjectType_proj")?.setSelectedKey(oObj.projectType || "FixedPrice");
            this.byId("inputStatus_proj")?.setSelectedKey(oObj.status || "Planned");
            
            // Handle opportunity field
            const sOppId = oObj.oppId || "";
            if (sOppId) {
                if (oObj.to_Opportunity && oObj.to_Opportunity.opportunityName) {
                    this.byId("inputOppId_proj")?.setValue(oObj.to_Opportunity.opportunityName);
                    this.byId("inputOppId_proj")?.data("selectedId", sOppId);
                    let oProjModel = this.getView().getModel("projectModel");
                    if (!oProjModel) {
                        oProjModel = new sap.ui.model.json.JSONModel({ oppId: sOppId });
                        this.getView().setModel(oProjModel, "projectModel");
                    } else {
                        oProjModel.setProperty("/oppId", sOppId);
                    }
                } else {
                    this.byId("inputOppId_proj")?.setValue(sOppId);
                    this.byId("inputOppId_proj")?.data("selectedId", sOppId);
                }
            } else {
                this.byId("inputOppId_proj")?.setValue("");
                this.byId("inputOppId_proj")?.data("selectedId", "");
            }
            
            this.byId("inputRequiredResources_proj")?.setValue(oObj.requiredResources || "");
            this.byId("inputAllocatedResources_proj")?.setValue(oObj.allocatedResources || "");
            this.byId("inputToBeAllocated_proj")?.setValue(oObj.toBeAllocated || "");
            this.byId("inputSOWReceived_proj")?.setSelectedKey(oObj.SOWReceived || "No");
            this.byId("inputPOReceived_proj")?.setSelectedKey(oObj.POReceived || "No");
        },

        _onCustDialogData: function (aSelectedContexts) {
            if (!aSelectedContexts || aSelectedContexts.length === 0) {
                // No selection - clear form for new entry
                // Generate next ID to show as placeholder (if not already set)
                const oCustomerIdInput = this.byId("inputCustomerId");
                if (oCustomerIdInput) {
                    // Only generate if field is empty or has default value
                    const sCurrentValue = oCustomerIdInput.getValue();
                    if (!sCurrentValue || sCurrentValue === "C-0001") {
                        const oTable = this.byId("Customers");
                        let sNextId = "C-0001"; // Default
                        try {
                            // Try to generate next ID from existing data
                            if (oTable) {
                                sNextId = this._generateNextIdFromBinding(oTable, "Customers", "SAPcustId", "C") || sNextId;
                            }
                        } catch (e) {
                            console.log("Could not generate next ID, using default:", sNextId);
                        }
                        oCustomerIdInput.setValue(sNextId);
                    }
                    // Ensure it's always disabled
                    oCustomerIdInput.setEnabled(false);
                    oCustomerIdInput.setPlaceholder("Auto-generated");
                }
                this.byId("inputCustomerName")?.setValue("");
                this.byId("inputCountry")?.setValue("");
                this.byId("inputState")?.setValue("");
                this.byId("inputStatus")?.setSelectedKey("");
                this.byId("inputVertical")?.setValue("");
                return;
            }
            
            // Row selected - populate form for update
            let oObj = aSelectedContexts[0].getObject();
            this.byId("inputCustomerId")?.setValue(oObj.SAPcustId || "");
            this.byId("inputCustomerId")?.setEnabled(false); // Always disabled - key field cannot be changed
            this.byId("inputCustomerId")?.setPlaceholder("");
            this.byId("inputCustomerName")?.setValue(oObj.customerName || "");
            this.byId("inputCountry")?.setValue(oObj.country || "");
            this.byId("inputState")?.setValue(oObj.state || "");
            // Status enum: backend uses A/I/P, form uses same keys now
            this.byId("inputStatus")?.setSelectedKey(oObj.status || "A");
            this.byId("inputVertical")?.setValue(oObj.vertical || "");
        },

        


        // delete functionalities
        onDeletePress: function (oEvent) {
            const buttonMap = {
                "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus" },
                "Employees": { edit: "Edit_emp", delete: "Delete_emp" },
                "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr" },
                "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj" },
                "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap" }
                // ✅ REMOVED: "Verticals": { edit: "btnEdit_vert", delete: "btnDelete_vert" }
            };

            // Determine which button triggered the event
            const sButtonId = oEvent.getSource().getId().split("--").pop();
            const sTableId = Object.keys(buttonMap).find(tableId => buttonMap[tableId].delete === sButtonId);

            if (!sTableId) {
                return sap.m.MessageBox.error("No table mapping found for delete button: " + sButtonId);
            }

            const oView = this.getView();
            const oTable = this.byId(sTableId);
            const oDeleteBtn = this.byId(buttonMap[sTableId].delete);
            const oEditBtn = this.byId(buttonMap[sTableId].edit);

            if (!oTable) {
                return sap.m.MessageBox.error(`Table '${sTableId}' not found.`);
            }

            const aSelectedContexts = oTable.getSelectedContexts?.() || [];

            if (aSelectedContexts.length === 0) {
                return sap.m.MessageBox.warning("Please select one or more entries to delete.");
            }

            sap.m.MessageBox.confirm("Are you sure you want to delete the selected entries?", {
                onClose: async (sAction) => {
                    if (sAction !== sap.m.MessageBox.Action.OK) {
                        return;
                    }

                    // Set busy state
                    oView.setBusy(true);

                    try {
                        console.log("Starting delete operation for", aSelectedContexts.length, "contexts");

                        // IMMEDIATELY clear busy state since we're using in-memory data
                        console.log("Clearing busy state immediately (in-memory data)");
                        oView.setBusy(false);

                        // Delete contexts one by one with immediate UI update
                        let bAllDeleted = true;
                        let sErrorMessage = "";

                        // 🚨 OFFICIAL SAP APPROACH: Use oContext.delete().then() pattern
                        console.log(`=== OFFICIAL SAP DELETE START ===`);
                        console.log(`Selected contexts: ${aSelectedContexts.length}`);

                        try {
                            // Use OData V4 update group so deletes are persisted server-side
                            console.log(`⏳ Deleting with update group "changesGroup"...`);
                            const oModel = this.getView().getModel();
                            const sGroupId = "changesGroup";
                            let queued = 0;
                            aSelectedContexts.forEach((oContext, index) => {
                                try {
                                    const sPath = oContext.getPath && oContext.getPath();
                                    console.log(`⏳ Queue DELETE ${index + 1}/${aSelectedContexts.length}: ${sPath}`);
                                    oContext.delete(sGroupId);
                                    queued++;
                                } catch (e) {
                                    console.log("❌ Failed to queue delete:", e);
                                }
                            });
                            if (queued > 0 && oModel && oModel.submitBatch) {
                                await oModel.submitBatch(sGroupId);
                                console.log(`✅ Batch submitted for ${queued} deletes`);
                                bAllDeleted = true;
                            } else {
                                bAllDeleted = false;
                            }

                        } catch (deleteError) {
                            console.log(`❌ Official delete failed:`, deleteError.message);
                            bAllDeleted = false;
                        }

                        console.log(`=== DELETE OPERATION END ===`);

                        // 🚨 OFFICIAL SAP PATTERN: Handle UI changes and refresh
                        console.log("🔄 Following official SAP pattern for UI updates...");

                        try {
                            // Set UI changes state (official SAP pattern)
                            this._setUIChanges(true);
                            console.log("✅ UI changes state set");

                            // Wait a moment for backend to process deletions
                            setTimeout(() => {
                                try {
                                    // Call the existing initializeTable function to update the table
                                    this.initializeTable(sTableId);
                                    console.log("✅ Table updated successfully");

                                    // Reset UI changes state after successful update
                                    this._setUIChanges(false);
                                    console.log("✅ UI changes state reset");

                                } catch (updateError) {
                                    console.log("❌ Table update error:", updateError);
                                    // Reset UI changes state on error
                                    this._setUIChanges(false);
                                }
                            }, 500); // Small delay to allow backend processing

                        } catch (updateError) {
                            console.log("❌ Table update error:", updateError);
                            // Reset UI changes state on error
                            this._setUIChanges(false);
                        }

                        console.log("All delete operations completed. Success:", bAllDeleted);

                        // Clear selection and force complete UI update
                        oTable.clearSelection();

                        // 🚨 SIMPLE: Just call the table update function again
                        try {
                            console.log("🔄 Final table update...");
                            this.initializeTable(sTableId);
                            console.log("✅ Final table update completed");
                        } catch (finalUpdateError) {
                            console.log("Final table update error:", finalUpdateError);
                        }

                        if (bAllDeleted) {
                            // All deletions successful
                            sap.m.MessageToast.show(`${sTableId} entries successfully deleted.`);

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
                        } else {
                            // Some deletions failed
                            console.error("Some deletions failed:", sErrorMessage);
                            sap.m.MessageBox.error("Some entries could not be deleted. Check console for details.");

                            // ✅ Force immediate UI refresh after delete (even if some failed)
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
                        }

                    } catch (error) {
                        // Only show blocking error if delete batch actually failed
                        if (!bAllDeleted) {
                            console.error("Critical delete operation error:", error);
                            sap.m.MessageBox.error("Delete operation failed completely. Please try again.");
                            // Refresh table to restore state
                            const oBinding = oTable.getBinding("items");
                            if (oBinding) {
                                oBinding.refresh();
                            }
                        } else {
                            // Non-critical error after successful delete (e.g., UI refresh)
                            console.warn("Non-critical error after successful delete:", error);
                        }
                    } finally {
                        // ALWAYS clear busy state - this is critical!
                        console.log("Final busy state clear");
                        oView.setBusy(false);

                        // Reset button states
                        oDeleteBtn?.setEnabled(false);
                        oEditBtn?.setEnabled(false);

                        // Force UI refresh
                        setTimeout(() => {
                            oView.invalidate();
                        }, 100);
                    }
                }
            });
        },
        onEditPress: function (oEvent) {
            // Button mapping for all tables
            const buttonMap = {
                "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus", save: "saveButton", cancel: "cancelButton", add: "btnAdd" },
                "Employees": { edit: "Edit_emp", delete: "Delete_emp", save: "saveButton_emp", cancel: "cancelButton_emp", add: "btnAdd_emp" },
                "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr", save: "saveButton_oppr", cancel: "cancelButton_oppr", add: "btnAdd_oppr" },
                "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj", save: "saveButton_proj", cancel: "cancelButton_proj", add: "btnAdd_proj" },
                "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap", save: "saveButton_sap", cancel: "cancelButton_sap", add: "btnAdd_sap" }
                // ✅ REMOVED: "Verticals": { edit: "btnEdit_vert", delete: "btnDelete_vert", save: "saveButton_vert", cancel: "cancelButton_vert", add: "btnAdd_vert" }
            };

            // Determine which table this edit is for
            let sTableId = "Customers"; // Default fallback
            if (oEvent && oEvent.getSource) {
                const sButtonId = oEvent.getSource().getId().split("--").pop();
                sTableId = Object.keys(buttonMap).find(tableId => buttonMap[tableId].edit === sButtonId) || "Customers";
            }

            const oTable = this.byId(sTableId);
            const aSelectedContexts = oTable.getSelectedContexts();

            if (!aSelectedContexts.length) {
                sap.m.MessageToast.show("Please select one or more rows to edit.");
                return;
            }
            
            // ✅ CRITICAL: For Opportunities and Projects, populate form fields when Edit button is clicked
            // This ensures all fields populate immediately when Edit is pressed, avoiding lag
            if (sTableId === "Opportunities" && aSelectedContexts.length > 0) {
                // Populate Opportunity form with selected row data
                const oContext = aSelectedContexts[0];
                if (oContext.requestObject && typeof oContext.requestObject === "function") {
                    // Request complete object to ensure all fields are available
                    oContext.requestObject().then(() => {
                        const oObj = oContext.getObject();
                        this._populateOpportunityFormComplete(oObj || {});
                    }).catch(() => {
                        // If request fails, use what we have
                        const oObj = oContext.getObject() || {};
                        this._populateOpportunityFormComplete(oObj);
                    });
                } else {
                    // No requestObject, populate with what we have
                    const oObj = oContext.getObject() || {};
                    this._populateOpportunityFormComplete(oObj);
                }
            } else if (sTableId === "Projects" && aSelectedContexts.length > 0) {
                // Populate Project form with selected row data
                const oContext = aSelectedContexts[0];
                if (oContext.requestObject && typeof oContext.requestObject === "function") {
                    // Request complete object to ensure all fields are available
                    oContext.requestObject().then(() => {
                        const oObj = oContext.getObject();
                        this._populateProjectFormComplete(oObj || {});
                    }).catch(() => {
                        // If request fails, use what we have
                        const oObj = oContext.getObject() || {};
                        this._populateProjectFormComplete(oObj);
                    });
                } else {
                    // No requestObject, populate with what we have
                    const oObj = oContext.getObject() || {};
                    this._populateProjectFormComplete(oObj);
                }
            }

            console.log(`=== [MULTI-EDIT] Starting edit for ${aSelectedContexts.length} rows ===`);

            // 🚀 MULTI-ROW EDITING: Process ALL selected rows
            const aEditingPaths = [];
            const aEditingContexts = [];

            aSelectedContexts.forEach((oContext, index) => {
                const oData = oContext.getObject();

                // Store original data for cancel
                oData._originalData = JSON.parse(JSON.stringify(oData));

                // Enable editable flags for fields
                oData.isEditable = true;

                // Track this context for multi-edit
                aEditingPaths.push(oContext.getPath());
                aEditingContexts.push(oContext);

                console.log(`[MULTI-EDIT] Row ${index + 1}: ${oContext.getPath()}`);
            });

            // ✅ FIXED: Track editing paths in TABLE-SPECIFIC edit model
            const oEditModel = this.getView().getModel("edit");
            const sEditingPaths = aEditingPaths.join(",");
            oEditModel.setProperty(`/${sTableId}/editingPath`, sEditingPaths);
            oEditModel.setProperty(`/${sTableId}/mode`, "multi-edit");
            oEditModel.setProperty("/currentTable", sTableId);  // Track active table

            // 🚀 DEBUG: Log what we're setting
            console.log(`[MULTI-EDIT] Setting editing paths: ${sEditingPaths}`);
            console.log(`[MULTI-EDIT] Edit model data:`, oEditModel.getData());

            // Enable Save/Cancel buttons, disable Edit/Delete/Add for the specific table
            const config = buttonMap[sTableId];
            this.byId(config.save)?.setEnabled(true);
            this.byId(config.cancel)?.setEnabled(true);
            this.byId(config.edit)?.setEnabled(false);
            this.byId(config.delete)?.setEnabled(false);
            this.byId(config.add)?.setEnabled(false);

            // Refresh table so template Fields switch to Editable mode for ALL selected rows
            oTable.getBinding("items")?.refresh();

            // 🚀 FORCE REFRESH: Additional refresh to ensure edit mode is applied
            setTimeout(() => {
                oTable.getBinding("items")?.refresh();
                console.log(`[MULTI-EDIT] Forced refresh completed`);
            }, 100);

            sap.m.MessageToast.show(`${aSelectedContexts.length} rows are now in edit mode.`);
        },
        // ✅ NEW: Internal method to perform the actual cancel operation (can skip confirmation)
        _performCancelOperation: function (sTableId, bSkipConfirmation) {
            const self = this; // Store reference to this

            // Button mapping for all tables
            const buttonMap = {
                "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus", save: "saveButton", cancel: "cancelButton", add: "btnAdd" },
                "Employees": { edit: "Edit_emp", delete: "Delete_emp", save: "saveButton_emp", cancel: "cancelButton_emp", add: "btnAdd_emp" },
                "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr", save: "saveButton_oppr", cancel: "cancelButton_oppr", add: "btnAdd_oppr" },
                "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj", save: "saveButton_proj", cancel: "cancelButton_proj", add: "btnAdd_proj" },
                "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap", save: "saveButton_sap", cancel: "cancelButton_sap", add: "btnAdd_sap" }
                // ✅ REMOVED: "Verticals": { edit: "btnEdit_vert", delete: "btnDelete_vert", save: "saveButton_vert", cancel: "cancelButton_vert", add: "btnAdd_vert" }
            };

            // Execute cancel logic directly (without confirmation dialog)
            console.log("=== [Controller] Starting cancel operation ===");

            const oTable = self.byId(sTableId);
            const oView = self.getView();
            const oModel = oView.getModel(); // OData V4 model
            const oEditModel = oView.getModel("edit");
            // ✅ FIXED: Get edit state for THIS specific table only
            const sPath = oEditModel.getProperty(`/${sTableId}/editingPath`) || "";
            const sMode = oEditModel.getProperty(`/${sTableId}/mode`);

            console.log("Current editing path:", sPath);
            console.log("Edit mode:", sMode);
            console.log("Table ID:", sTableId);

            if (!sPath) {
                sap.m.MessageToast.show("No row is in edit mode.");
                return;
            }

            // ✅ FIXED: Cancel only SELECTED rows, not all rows in editingPath
            let aContextsToCancel = [];
            const aSelectedContexts = oTable.getSelectedContexts();

            // ✅ Always prioritize selected rows - if user selected specific rows, only cancel those
            if (aSelectedContexts && aSelectedContexts.length > 0) {
                // User has selected specific rows - only cancel those
                aContextsToCancel = aSelectedContexts.filter(ctx => {
                    // Only include contexts that are in the editingPath
                    const sCtxPath = ctx.getPath();
                    if (sMode === "add-multi" || sMode === "multi-edit") {
                        return sPath.includes(sCtxPath);
                    }
                    return sPath === sCtxPath || sPath.includes(sCtxPath);
                });
                console.log(`=== [SELECTIVE-CANCEL] Canceling ${aContextsToCancel.length} selected rows out of ${aSelectedContexts.length} selected ===`);
            } else if ((sMode === "multi-edit" || sMode === "add-multi") && sPath.includes(",")) {
                // No selection, but multiple rows in edit mode - cancel ALL of them
                // (This is the "cancel all" behavior)
                const aPaths = sPath.split(",").filter(Boolean);
                aContextsToCancel = aPaths.map(p => self._resolveContextByPath(oTable, p)).filter(Boolean);
                console.log(`=== [MULTI-CANCEL] Canceling ${aContextsToCancel.length} rows (no selection, canceling all) ===`);
            } else {
                // Single row editing: resolve the specific context reliably
                let oContext = self._resolveContextByPath(oTable, sPath);
                if (!oContext) {
                    // Try to get from selection as fallback
                    const aFallbackSelected = oTable.getSelectedContexts();
                    oContext = aFallbackSelected && aFallbackSelected.find(ctx => ctx.getPath() === sPath) || aFallbackSelected && aFallbackSelected[0];
                }
                if (!oContext) {
                    sap.m.MessageToast.show("Unable to find edited context.");
                    return;
                }
                aContextsToCancel = [oContext];
                console.log(`=== [SINGLE-CANCEL] Canceling 1 row ===`);
            }

            if (aContextsToCancel.length === 0) {
                sap.m.MessageToast.show("No rows selected to cancel. Please select the row(s) you want to cancel.");
                return;
            }

            try {
                // 1. Debug the current state
                console.log("=== [CANCEL] Current Edit State ===");
                console.log("Edit Model:", oEditModel.getData());
                console.log("Editing Path:", sPath);
                console.log("Mode:", sMode);

                // 2. Do not reset all model changes here; cancel is scoped per-context
                //    We only delete the transient context or restore the single edited context below

                // 3. Process ALL contexts to cancel
                aContextsToCancel.forEach((oContext, index) => {
                    const sContextPath = oContext.getPath();
                    console.log(`[MULTI-CANCEL] Processing row ${index + 1}: ${sContextPath}`);

                    try {
                        const oData = oContext.getObject();

                        // ✅ FIXED: Better detection of truly new unsaved rows
                        // A new row that hasn't been saved will have:
                        // 1. Path starting with '$' (e.g., '$3') OR
                        // 2. _isNew flag set AND it's in "add" mode
                        const bIsTemporaryPath = sContextPath && (sContextPath.startsWith('$') || sContextPath.includes('/$'));
                        const bIsInAddMode = sMode === "add" || sMode === "add-multi";
                        const bIsNewRow = bIsTemporaryPath || (oData._isNew && bIsInAddMode);

                        // Check if truly transient (only for unsaved new rows)
                        let bIsTransient = false;
                        if (typeof oContext.isTransient === "function") {
                            bIsTransient = oContext.isTransient();
                        }

                        // ✅ Only delete if it's a truly new unsaved row (not an existing saved row being edited)
                        if (bIsNewRow && bIsTransient && bIsInAddMode) {
                            try {
                                oContext.delete();
                                console.log(`[MULTI-CANCEL] Deleted new/transient row ${index + 1}: ${sContextPath}`);
                            } catch (e) {
                                console.log(`[MULTI-CANCEL] Error deleting transient row: ${e.message}`);
                            }
                            return; // Skip to next row
                        }

                        // ✅ For existing rows (saved or being edited), restore original data
                        console.log(`[MULTI-CANCEL] Row ${index + 1} is existing row, restoring original data...`);
                        console.log(`[MULTI-CANCEL] Row ${index + 1} original data exists:`, !!oData._originalData);

                        if (oData._originalData) {
                            console.log(`[MULTI-CANCEL] Restoring original data for row ${index + 1}...`);
                            const oOriginalData = oData._originalData;

                            // Restore all original properties
                            Object.keys(oOriginalData).forEach(sKey => {
                                if (sKey !== '_originalData' && sKey !== 'isEditable' && sKey !== '_hasChanged' && sKey !== '_isNew') {
                                    try {
                                        let vValue = oOriginalData[sKey];
                                        if (vValue instanceof Date) {
                                            vValue = new Date(vValue.getTime());
                                        }
                                        oContext.setProperty(sKey, vValue);
                                    } catch (propError) {
                                        console.warn(`[MULTI-CANCEL] Error restoring property ${sKey}:`, propError);
                                    }
                                }
                            });

                            // Clean up the temporary properties
                            delete oData._originalData;
                            delete oData._hasChanged;
                            delete oData.isEditable;
                            // Don't delete _isNew here if it exists (it shouldn't for saved rows)

                            console.log(`[MULTI-CANCEL] Restored original data for row ${index + 1}`);
                        } else {
                            // ✅ If no _originalData, this might be a saved row being edited for the first time
                            // In this case, just clear the edit flags but don't delete
                            console.log(`[MULTI-CANCEL] No original data found for row ${index + 1}, clearing edit flags only`);
                            delete oData.isEditable;
                            delete oData._hasChanged;
                            // Don't delete the row - it's an existing saved row
                        }
                    } catch (contextError) {
                        console.error(`[MULTI-CANCEL] Error processing context ${index + 1}:`, contextError);
                    }
                });

                // ✅ FIXED: Update editingPath to remove canceled rows, keep others
                const aCanceledPaths = aContextsToCancel.map(ctx => ctx.getPath()).filter(Boolean);
                let sRemainingPath = sPath;

                // Remove canceled paths from editingPath
                if (aCanceledPaths.length > 0) {
                    const aCurrentPaths = sPath.split(",").filter(Boolean);
                    const aRemainingPaths = aCurrentPaths.filter(p => !aCanceledPaths.includes(p));

                    if (aRemainingPaths.length > 0) {
                        // Still have other rows in edit mode
                        sRemainingPath = aRemainingPaths.join(",");
                        oEditModel.setProperty(`/${sTableId}/editingPath`, sRemainingPath);
                        // Keep mode as is (add-multi or multi-edit)
                        console.log(`[MULTI-CANCEL] Updated editingPath, remaining rows: ${aRemainingPaths.length}`);
                    } else {
                        // All rows canceled, clear edit state
                        oEditModel.setProperty(`/${sTableId}/editingPath`, "");
                        oEditModel.setProperty(`/${sTableId}/mode`, null);
                        if (oEditModel.getProperty("/currentTable") === sTableId) {
                            oEditModel.setProperty("/currentTable", null);
                        }
                        console.log(`[MULTI-CANCEL] All rows canceled, edit state cleared`);
                    }
                } else {
                    // No canceled paths (shouldn't happen, but handle gracefully)
                    oEditModel.setProperty(`/${sTableId}/editingPath`, "");
                    oEditModel.setProperty(`/${sTableId}/mode`, null);
                    if (oEditModel.getProperty("/currentTable") === sTableId) {
                        oEditModel.setProperty("/currentTable", null);
                    }
                }

                // 🚨 CRITICAL: Discard pending changes for edited contexts only
                console.log("[MULTI-CANCEL] Discarding pending changes for edited contexts...");
                try {
                    const oModel = self.getView().getModel();
                    if (oModel && oModel.getPendingChanges) {
                        const aPendingChanges = oModel.getPendingChanges();
                        console.log("[MULTI-CANCEL] Pending changes found:", aPendingChanges.length);

                        // Discard changes for specific contexts
                        aContextsToCancel.forEach((oContext, index) => {
                            if (oContext && oContext.getPath) {
                                const sContextPath = oContext.getPath();
                                console.log(`[MULTI-CANCEL] Discarding changes for context ${index + 1}: ${sContextPath}`);

                                // Try to discard changes for this specific context
                                try {
                                    if (oContext.reset) {
                                        oContext.reset();
                                        console.log(`[MULTI-CANCEL] Reset context ${index + 1}`);
                                    }
                                } catch (resetError) {
                                    console.log(`[MULTI-CANCEL] Context reset failed for ${index + 1}:`, resetError);
                                }
                            }
                        });
                    }
                } catch (discardError) {
                    console.log("[MULTI-CANCEL] Error discarding pending changes:", discardError);
                }

                // 5. Update button states based on remaining rows in edit mode
                const config = buttonMap[sTableId];

                // Check if there are still rows in edit mode after canceling
                // ✅ FIXED: Reuse the sRemainingPath variable or read from model directly
                const sRemainingPathAfterCancel = oEditModel.getProperty(`/${sTableId}/editingPath`) || "";
                const bHasRemainingRows = sRemainingPathAfterCancel && sRemainingPathAfterCancel.length > 0;

                if (bHasRemainingRows) {
                    // Still have rows in edit mode - keep Save/Cancel enabled
                    self.byId(config.save)?.setEnabled(true);
                    self.byId(config.cancel)?.setEnabled(true);
                    self.byId(config.edit)?.setEnabled(false);
                    self.byId(config.delete)?.setEnabled(false);
                    self.byId(config.add)?.setEnabled(true);
                    console.log(`[MULTI-CANCEL] Buttons remain enabled (${sRemainingPathAfterCancel.split(',').length} rows still in edit)`);
                } else {
                    // All rows canceled - disable Save/Cancel
                    self.byId(config.save)?.setEnabled(false);
                    self.byId(config.cancel)?.setEnabled(false);
                    self.byId(config.edit)?.setEnabled(false);
                    self.byId(config.delete)?.setEnabled(false);
                    self.byId(config.add)?.setEnabled(true);
                    // Clear selection only if all rows are canceled
                    oTable.clearSelection();
                    console.log(`[MULTI-CANCEL] All rows canceled, buttons disabled`);
                }

                // 6. Reset binding changes per SAP pattern, then force table refresh to exit edit mode
                try {
                    // Reset pending changes at binding level
                    const oBinding = oTable.getBinding("items");
                    const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
                    if (oBinding && oBinding.resetChanges) {
                        oBinding.resetChanges();
                        console.log("[MULTI-CANCEL] Binding changes reset");
                    }
                    if (oRowBinding && oRowBinding.resetChanges) {
                        oRowBinding.resetChanges();
                        console.log("[MULTI-CANCEL] Row binding changes reset");
                    }

                    // Force refresh all bindings
                    if (oBinding) { oBinding.refresh(true); }
                    if (oRowBinding) { oRowBinding.refresh(true); }

                    // Force refresh the table itself
                    if (oTable.refresh) {
                        oTable.refresh();
                    }

                    // Clear selection to ensure clean state
                    oTable.clearSelection();

                    // Force a complete table rebind to exit edit mode
                    setTimeout(() => {
                        try {
                            const oBinding2 = oTable.getBinding("items");
                            if (oBinding2) {
                                oBinding2.refresh();
                            }
                            console.log("[MULTI-CANCEL] Secondary refresh completed");
                        } catch (e) {
                            console.warn("[MULTI-CANCEL] Secondary refresh error:", e);
                        }
                    }, 100);

                    console.log("[MULTI-CANCEL] Table refreshed and selection cleared");
                } catch (refreshError) {
                    console.warn("[MULTI-CANCEL] Error refreshing table:", refreshError);
                }

                // 7. Additional verification
                setTimeout(() => {
                    console.log("=== [Controller] Post-cancel state check ===");
                    console.log("Edit Model after cancel:", oEditModel.getData());
                    console.log("Save Button Enabled:", self.byId(config.save)?.getEnabled());
                    console.log("Cancel Button Enabled:", self.byId(config.cancel)?.getEnabled());
                }, 200);

                // 8. 🚨 CRITICAL: Force refresh from database to show original data
                const oBinding = oTable.getBinding("items");
                if (oBinding) {
                    // Force refresh from server to get original data
                    oBinding.refresh(true); // true = force refresh from server
                    console.log("[MULTI-CANCEL] Forced table refresh from database to show original data");
                }

                // 9. Force exit edit mode completely
                try {
                    // Force all cells to exit edit mode
                    const oInnerTable = oTable._oTable;
                    if (oInnerTable && oInnerTable.getItems) {
                        const aItems = oInnerTable.getItems();
                        aItems.forEach(item => {
                            if (item.getCells) {
                                item.getCells().forEach(cell => {
                                    if (cell.setEditable) {
                                        cell.setEditable(false);
                                    }
                                });
                            }
                        });
                    }

                    console.log("[MULTI-CANCEL] Forced exit from edit mode");
                } catch (editModeError) {
                    console.warn("[MULTI-CANCEL] Error forcing exit from edit mode:", editModeError);
                }

                // 10. Additional refresh to ensure UI shows original data
                setTimeout(() => {
                    if (oBinding) {
                        oBinding.refresh(true);
                        console.log("[MULTI-CANCEL] Secondary refresh from database");
                    }
                }, 100);

                if (!bSkipConfirmation) {
                    sap.m.MessageToast.show("Changes discarded successfully.");
                }
            } catch (error) {
                console.error("Error during cancel operation:", error);
                console.error("Error details:", {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                if (!bSkipConfirmation) {
                    sap.m.MessageBox.error(`Error discarding changes: ${error.message}. Please check console for details.`);
                }
            }
        },

        // ✅ Public method: Cancel button press (shows confirmation dialog)
        onCancelButtonPress: function (oEvent) {
            // ✅ FIXED: Store reference to this (which is the controller when delegated)
            // When called from fragment via controller delegation, 'this' is the controller instance
            const oController = this;

            // Button mapping for all tables
            const buttonMap = {
                "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus", save: "saveButton", cancel: "cancelButton", add: "btnAdd" },
                "Employees": { edit: "Edit_emp", delete: "Delete_emp", save: "saveButton_emp", cancel: "cancelButton_emp", add: "btnAdd_emp" },
                "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr", save: "saveButton_oppr", cancel: "cancelButton_oppr", add: "btnAdd_oppr" },
                "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj", save: "saveButton_proj", cancel: "cancelButton_proj", add: "btnAdd_proj" },
                "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap", save: "saveButton_sap", cancel: "cancelButton_sap", add: "btnAdd_sap" }
                // ✅ REMOVED: "Verticals": { edit: "btnEdit_vert", delete: "btnDelete_vert", save: "saveButton_vert", cancel: "cancelButton_vert", add: "btnAdd_vert" }
            };

            // Determine which table this cancel is for
            let sTableId = "Customers"; // Default fallback
            if (oEvent && oEvent.getSource) {
                const sButtonId = oEvent.getSource().getId().split("--").pop();
                sTableId = Object.keys(buttonMap).find(tableId => buttonMap[tableId].cancel === sButtonId) || "Customers";
            }

            sap.m.MessageBox.confirm(
                "Are you sure you want to cancel? Unsaved changes will be lost.",
                {
                    icon: sap.m.MessageBox.Icon.WARNING,
                    title: "Cancel Edit",
                    actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
                    onClose: function (sAction) {
                        if (sAction === sap.m.MessageBox.Action.YES) {
                            // ✅ FIXED: Call _performCancelOperation on the controller instance
                            // The method is exposed in Home.controller.js, so it's available on the controller
                            oController._performCancelOperation(sTableId, false);
                        }
                    }
                }
            );
        },
        // Official SAP pattern: Handle UI changes state
        _setUIChanges: function (bHasChanges) {
            try {
                const oView = this.getView();
                const oAppModel = oView.getModel("appView");

                if (oAppModel) {
                    oAppModel.setProperty("/hasUIChanges", bHasChanges);
                    console.log(`UI changes state set to: ${bHasChanges}`);
                } else {
                    console.log("App model not found, creating new one");
                    const oViewModel = new JSONModel({
                        busy: false,
                        hasUIChanges: bHasChanges,
                        usernameEmpty: false,
                        order: 0
                    });
                    oView.setModel(oViewModel, "appView");
                    console.log(`New app model created with UI changes: ${bHasChanges}`);
                }
            } catch (error) {
                console.log("Error setting UI changes state:", error);
            }
        },

        // 🚀 HELPERS: Row binding and context resolution
        _getRowBinding: function (oTable) {
            return (oTable && oTable.getRowBinding && oTable.getRowBinding())
                || (oTable && oTable.getBinding && (oTable.getBinding("items") || oTable.getBinding("rows")))
                || null;
        },
        _resolveContextByPath: function (oTable, sPath) {
            if (!oTable || !sPath) return null;
            const oBinding = this._getRowBinding(oTable);
            if (oBinding) {
                // Try to find among currently available contexts
                const aCtx = (typeof oBinding.getAllCurrentContexts === "function") ? oBinding.getAllCurrentContexts() : oBinding.getContexts();
                if (Array.isArray(aCtx) && aCtx.length) {
                    const hit = aCtx.find((c) => c && c.getPath && c.getPath() === sPath);
                    if (hit) return hit;
                }
            }
            // Fallback: look up via inner responsive table items
            const oInner = oTable && oTable._oTable;
            if (oInner && typeof oInner.getItems === "function") {
                const aItems = oInner.getItems();
                for (let i = 0; i < aItems.length; i++) {
                    const ctx = aItems[i].getBindingContext && aItems[i].getBindingContext();
                    if (ctx && ctx.getPath && ctx.getPath() === sPath) {
                        return ctx;
                    }
                }
            }
            return null;
        },
        onSaveButtonPress: async function (oEvent) {

            // Button mapping for all tables
            const buttonMap = {
                "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus", save: "saveButton", cancel: "cancelButton", add: "btnAdd" },
                "Employees": { edit: "Edit_emp", delete: "Delete_emp", save: "saveButton_emp", cancel: "cancelButton_emp", add: "btnAdd_emp" },
                "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr", save: "saveButton_oppr", cancel: "cancelButton_oppr", add: "btnAdd_oppr" },
                "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj", save: "saveButton_proj", cancel: "cancelButton_proj", add: "btnAdd_proj" },
                "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap", save: "saveButton_sap", cancel: "cancelButton_sap", add: "btnAdd_sap" }
                // ✅ REMOVED: "Verticals": { edit: "btnEdit_vert", delete: "btnDelete_vert", save: "saveButton_vert", cancel: "cancelButton_vert", add: "btnAdd_vert" }
            };

            // Determine which table this save is for
            let sTableId = "Customers"; // Default fallback
            if (oEvent && oEvent.getSource) {
                const sButtonId = oEvent.getSource().getId().split("--").pop();
                sTableId = Object.keys(buttonMap).find(tableId => buttonMap[tableId].save === sButtonId) || "Customers";
            }

            // ✅ FIXED: Use table-specific group ID (no hyphens - OData V4 requirement)
            // Ensure no hyphens - replace any that might exist
            let sSafeTableId = sTableId.replace(/-/g, ""); // Remove any hyphens
            const GROUP_ID = `changesGroup${sSafeTableId}`;
            console.log(`[SAVE] Using GROUP_ID: ${GROUP_ID} for table: ${sTableId}`);

            const oTable = this.byId(sTableId);
            const oView = this.getView();
            const oModel = oView.getModel(); // OData V4 model
            const oEditModel = oView.getModel("edit");
            // ✅ FIXED: Get edit state for THIS specific table only
            const sPath = oEditModel.getProperty(`/${sTableId}/editingPath`) || "";
            const sMode = oEditModel.getProperty(`/${sTableId}/mode`);

            if (!sPath) {
                sap.m.MessageToast.show("No row is in edit mode.");
                return;
            }

            // 🚀 MULTI-ROW SAVE: Handle multi-edit and multi-add
            let aContextsToSave = [];

            if (sMode === "multi-edit" && sPath.includes(",")) {
                // Multi-row editing: get all selected contexts
                const aSelectedContexts = oTable.getSelectedContexts();
                aContextsToSave = aSelectedContexts;
                console.log(`=== [MULTI-SAVE] Saving ${aContextsToSave.length} rows ===`);
            } else if (sMode === "add-multi" && sPath.includes(",")) {
                // Multi-add: resolve all transient contexts from the stored paths
                const aPaths = sPath.split(",").filter(Boolean);
                aContextsToSave = aPaths.map(p => this._resolveContextByPath(oTable, p)).filter(Boolean);
                console.log(`=== [MULTI-SAVE][ADD] Saving ${aContextsToSave.length} new rows ===`);
            } else {
                // Single row editing: find the specific context
                let oContext = this._resolveContextByPath(oTable, sPath);
                if (!oContext) {
                    // As a fallback, use first selected
                    const aSelectedContexts = oTable.getSelectedContexts();
                    oContext = aSelectedContexts && aSelectedContexts[0];
                }
                if (!oContext) {
                    sap.m.MessageBox.error("Unable to find edited context.");
                    return;
                }
                aContextsToSave = [oContext];
                console.log(`=== [SINGLE-SAVE] Saving 1 row ===`);
            }

            this.getView().setBusy(true);

            try {
                // 🔹 Push changed values from table cells into ALL contexts
                const oInnerTable = oTable._oTable; // internal responsiveTable of MDC
                if (oInnerTable && oInnerTable.getItems) {
                    const aItems = oInnerTable.getItems();

                    // Process each context to save
                    aContextsToSave.forEach((oContext, index) => {
                        const sContextPath = oContext.getPath();
                        const oData = oContext.getObject();
                        const bIsNewRow = oData && (oData._isNew || (typeof oContext.isTransient === "function" && oContext.isTransient()));

                        console.log(`[MULTI-SAVE] Processing row ${index + 1}: ${sContextPath}, IsNew: ${bIsNewRow}`);

                        if (bIsNewRow) {
                            // ✅ NEW ROW: Properties are set during cell edits (they automatically use "changesGroup")
                            // ✅ CRITICAL: New rows are created with "changesGroup" from manifest.json
                            // ✅ DO NOT call setProperty again - it causes group mismatch errors
                            // ✅ The properties are already set when user edits cells in the table
                            console.log(`[MULTI-SAVE] New row ${index + 1} - properties already set during editing, skipping setProperty calls`);

                            // Remove client-side properties
                            if (oData) {
                                delete oData._isNew;
                                delete oData.isEditable;
                                delete oData._hasChanged;
                                delete oData._originalData;
                            }
                        } else {
                            // ✅ EXISTING ROW: Update properties from table cells
                            const oRow = aItems.find(item => {
                                const ctx = item.getBindingContext();
                                return ctx && ctx.getPath() === sContextPath;
                            });

                            if (oRow) {
                                oRow.getCells().forEach((cell) => {
                                    const oBinding = cell.getBinding("value");
                                    if (oBinding?.getPath && cell.getValue) {
                                        const sProp = oBinding.getPath();
                                        const vVal = cell.getValue();
                                        // ✅ Use GROUP_ID without hyphen (OData V4 requirement)
                                        oContext.setProperty(sProp, vVal, GROUP_ID);
                                    }
                                });

                                // Remove client-side properties
                                if (oData) {
                                    delete oData._isNew;
                                    delete oData.isEditable;
                                    delete oData._hasChanged;
                                    delete oData._originalData;
                                    console.log(`[MULTI-SAVE] Cleaned client-side properties for row ${index + 1}`);
                                }
                            }
                        }
                    });
                }

                // ✅ FIXED: For new rows, use the default "changesGroup" from manifest
                // ✅ For existing rows, use table-specific GROUP_ID
                // ✅ Check if we have new rows - if so, submit both groups
                const aNewRows = aContextsToSave.filter(ctx => {
                    const oData = ctx.getObject();
                    return oData && (oData._isNew || (typeof ctx.isTransient === "function" && ctx.isTransient()));
                });

                if (aNewRows.length > 0) {
                    // ✅ New rows exist - submit with default "changesGroup"
                    console.log(`[MULTI-SAVE] Submitting ${aNewRows.length} new rows with default group "changesGroup"`);
                    await oModel.submitBatch("changesGroup");

                    // If there are existing rows, submit them separately
                    const aExistingRows = aContextsToSave.filter(ctx => !aNewRows.includes(ctx));
                    if (aExistingRows.length > 0) {
                        console.log(`[MULTI-SAVE] Submitting ${aExistingRows.length} existing rows with group ${GROUP_ID}`);
                        await oModel.submitBatch(GROUP_ID);
                    }
                } else {
                    // ✅ Only existing rows - use table-specific group
                    console.log(`[MULTI-SAVE] Submitting ${aContextsToSave.length} existing rows with group ${GROUP_ID}`);
                    await oModel.submitBatch(GROUP_ID);
                }

                // 🔹 Clear the original data after successful save for ALL contexts
                aContextsToSave.forEach((oContext, index) => {
                    const oData = oContext.getObject();
                    if (oData._originalData) {
                        delete oData._originalData;
                    }
                    delete oData.isEditable;
                    delete oData._isNew; // Clear new row marker
                    console.log(`[MULTI-SAVE] Cleared original data for row ${index + 1}`);
                });

                sap.m.MessageToast.show("Changes saved successfully.");

                // 🔹 Refresh table
                oTable.getBinding("items")?.refresh();

                // ✅ FIXED: Reset edit state for THIS table only
                oEditModel.setProperty(`/${sTableId}/editingPath`, "");
                oEditModel.setProperty(`/${sTableId}/mode`, null);
                if (oEditModel.getProperty("/currentTable") === sTableId) {
                    oEditModel.setProperty("/currentTable", null);
                }

                // Clear selection to make table look normal
                oTable.clearSelection();

                const config = buttonMap[sTableId];
                this.byId(config.save)?.setEnabled(false);
                this.byId(config.cancel)?.setEnabled(false);
                this.byId(config.edit)?.setEnabled(false); // Disable edit until new selection
                this.byId(config.delete)?.setEnabled(false); // Disable delete until new selection
                this.byId(config.add)?.setEnabled(true);

                // Force table refresh to exit edit mode completely
                const oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.refresh();
                }

            } catch (err) {
                console.error("Error saving changes:", err);
                sap.m.MessageBox.error("Error saving changes. Check console for details.");
            } finally {
                this.getView().setBusy(false);
            }
        },

        // 🚀 ADD NEW ROW FUNCTIONALITY
        onAdd: function (oEvent) {
            console.log("=== [ADD] Function called ===");

            try {
                // Determine which table this add is for
                let sTableId = "Customers"; // Default fallback
                if (oEvent && oEvent.getSource) {
                    const sButtonId = oEvent.getSource().getId().split("--").pop();
                    console.log("Add Button ID:", sButtonId);
                    // Map button IDs to table IDs
                    if (sButtonId.includes("cus") || sButtonId === "btnAdd") sTableId = "Customers";
                    else if (sButtonId.includes("emp") || sButtonId === "btnAdd_emp") sTableId = "Employees";
                    else if (sButtonId.includes("oppr") || sButtonId === "btnAdd_oppr") sTableId = "Opportunities";
                    else if (sButtonId.includes("proj") || sButtonId === "btnAdd_proj") sTableId = "Projects";
                    else if (sButtonId.includes("sap") || sButtonId === "btnAdd_sap") sTableId = "SAPIdStatuses";
                    // ✅ REMOVED: else if (sButtonId.includes("vert") || sButtonId == "btnAdd_vert") sTableId = "Verticals";
                }

                console.log("Table ID:", sTableId);
                const oTable = this.byId(sTableId);
                if (!oTable) {
                    console.error("Table not found:", sTableId);
                    sap.m.MessageBox.error(`Table '${sTableId}' not found.`);
                    return;
                }

                console.log(`=== [ADD] Starting add new row for ${sTableId} ===`);

                // Get table binding with retry logic (prefer MDC row binding)
                let oBinding = (oTable.getRowBinding && oTable.getRowBinding())
                    || oTable.getBinding("items")
                    || oTable.getBinding("rows");
                console.log("Primary binding check:", oBinding);

                // Optional debug (avoid calling non-existent APIs)
                try { console.log("Table model:", oTable.getModel()); } catch (e) { }
                try { console.log("Table binding info (items):", oTable.getBindingInfo && oTable.getBindingInfo("items")); } catch (e) { }

                if (!oBinding) {
                    console.log("Primary binding not found, retrying shortly...");
                    setTimeout(() => {
                        const oRetryBinding = (oTable.getRowBinding && oTable.getRowBinding())
                            || oTable.getBinding("items")
                            || oTable.getBinding("rows")
                            || oTable.getBinding("data");
                        if (oRetryBinding) {
                            console.log("Binding found on retry:", oRetryBinding);
                            this._executeAddWithRetry(oTable, oRetryBinding, sTableId);
                        } else {
                            sap.m.MessageBox.error("No data binding available. Please ensure the table is fully loaded and try again.");
                        }
                    }, 400);
                    return;
                }

                if (!oBinding) {
                    console.error("No binding found with any method");

                    // Try to get model directly and create binding manually
                    const oModel = oTable.getModel();
                    if (oModel) {
                        console.log("Model found, trying to create binding manually...");
                        const sPath = "/" + sTableId; // Try direct path
                        console.log("Trying direct path:", sPath);

                        try {
                            // Try to create a new context directly
                            const oNewContext = oModel.createEntry(sPath, {
                                properties: this._createEmptyRowData(sTableId)
                            });

                            if (oNewContext) {
                                console.log("Direct context creation successful:", oNewContext.getPath());

                                // 🚨 Add client-side properties AFTER context creation
                                const oData = oNewContext.getObject();
                                if (oData) {
                                    oData._isNew = true;
                                    oData.isEditable = true;
                                    oData._hasChanged = false;
                                    console.log("Added client-side properties to direct context");
                                }

                                this._executeAddWithRetry(oTable, null, sTableId, oNewContext);
                                return;
                            }
                        } catch (directError) {
                            console.log("Direct context creation failed:", directError);
                        }
                    }

                    // Try one more time with a longer delay
                    setTimeout(() => {
                        console.log("Retrying binding detection...");
                        oBinding = oTable.getBinding("items") || oTable.getBinding("rows") || oTable.getBinding("data");
                        if (oBinding) {
                            console.log("Binding found on retry:", oBinding.getPath());
                            this._executeAddWithRetry(oTable, oBinding, sTableId);
                        } else {
                            sap.m.MessageBox.error("No data binding available. Please ensure the table is fully loaded and try again.");
                        }
                    }, 1000); // Increased delay to 1 second
                    return;
                }

                // Create new empty row data and create via V4 ListBinding.create
                // const oNewRowData = this._createEmptyRowData(sTableId);
                // console.log("New row data:", oNewRowData);
                // const oNewContext = oBinding.create(oNewRowData);

                // if (!oNewContext) {
                //     console.error("Failed to create new context");
                //     sap.m.MessageBox.error("Failed to create new row.");
                //     return;
                // }

                // console.log("New context created:", oNewContext.getPath());
                const oNewRowData = this._createEmptyRowData(sTableId);
                // console.log("New row data before ID:", oNewRowData);

                try {
                    const idMap = {
                        Customers: { field: "SAPcustId", prefix: "C" },
                        Opportunities: { field: "sapOpportunityId", prefix: "O" },
                        Projects: { field: "sapPId", prefix: "P" }
                    };

                    if (idMap[sTableId]) {
                        const { field, prefix } = idMap[sTableId];
                        const sGeneratedId = this._generateNextIdFromBinding(oTable, sTableId, field, prefix);
                        oNewRowData[field] = sGeneratedId;
                    }
                } catch (e) {
                    console.warn(`Failed to generate ID for ${sTableId}`, e);
                }

                // ✅ FIXED: Create new context with default "changesGroup" (from manifest)
                // ✅ New rows must use the same group as configured in manifest.json
                // ✅ This ensures consistency - new rows are created and saved with "changesGroup"
                const oNewContext = oBinding.create(oNewRowData, "changesGroup");

                // 🚨 Add client-side properties AFTER context creation (not in the data sent to server)
                const oData = oNewContext.getObject();
                if (oData) {
                    oData._isNew = true;
                    oData.isEditable = true;
                    oData._hasChanged = false;
                    console.log(`[ADD] Added client-side properties to new context with group: changesGroup`);
                }

                // Set the new row in edit mode
                const oEditModel = this.getView().getModel("edit");
                if (!oEditModel) {
                    // Create edit model if it doesn't exist
                    const oEditModelData = {
                        editingPath: "",
                        mode: null
                    };
                    this.getView().setModel(new sap.ui.model.json.JSONModel(oEditModelData), "edit");
                }

                // ✅ FIXED: Get edit state for THIS specific table
                const oEditModelFinal = this.getView().getModel("edit");
                const sExistingPaths = oEditModelFinal.getProperty(`/${sTableId}/editingPath`) || "";
                const sNewPath = oNewContext.getPath();
                if (sExistingPaths && sExistingPaths.length > 0) {
                    const aPaths = sExistingPaths.split(",").filter(Boolean);
                    if (!aPaths.includes(sNewPath)) {
                        aPaths.push(sNewPath);
                    }
                    oEditModelFinal.setProperty(`/${sTableId}/editingPath`, aPaths.join(","));
                    oEditModelFinal.setProperty(`/${sTableId}/mode`, "add-multi");
                } else {
                    oEditModelFinal.setProperty(`/${sTableId}/editingPath`, sNewPath);
                    oEditModelFinal.setProperty(`/${sTableId}/mode`, "add");
                }
                oEditModelFinal.setProperty("/currentTable", sTableId);  // Track active table

                // Enable Save and Cancel buttons, disable others
                const buttonMap = {
                    "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus", save: "saveButton", cancel: "cancelButton", add: "btnAdd" },
                    "Employees": { edit: "Edit_emp", delete: "Delete_emp", save: "saveButton_emp", cancel: "cancelButton_emp", add: "btnAdd_emp" },
                    "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr", save: "saveButton_oppr", cancel: "cancelButton_oppr", add: "btnAdd_oppr" },
                    "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj", save: "saveButton_proj", cancel: "cancelButton_proj", add: "btnAdd_proj" },
                    "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap", save: "saveButton_sap", cancel: "cancelButton_sap", add: "btnAdd_sap" },
                    "Verticals": { edit: "btnEdit_vert", delete: "btnDelete_vert", save: "saveButton_vert", cancel: "cancelButton_vert", add: "btnAdd_vert" }
                };

                const config = buttonMap[sTableId];
                this.byId(config.save)?.setEnabled(true);
                this.byId(config.cancel)?.setEnabled(true);
                this.byId(config.edit)?.setEnabled(false);
                this.byId(config.delete)?.setEnabled(false);
                // Keep Add enabled to allow multi-row creation
                this.byId(config.add)?.setEnabled(true);

                // Clear any existing selection
                oTable.clearSelection();

                // Refresh table to show new row in edit mode
                oTable.getBinding("items")?.refresh();

                // Force refresh to ensure edit mode is applied
                setTimeout(() => {
                    oTable.getBinding("items")?.refresh();
                    console.log(`[ADD] New row added and in edit mode for ${sTableId}`);
                }, 100);

                sap.m.MessageToast.show("New row added. You can now fill in the data.");

            } catch (error) {
                console.error("Add row error:", error);
                sap.m.MessageBox.error("Failed to add new row: " + error.message);
            }
        },

        // 🚀 HELPER: Create empty row data based on table type
        _createEmptyRowData: function (sTableId) {
            const oEmptyData = {};

            // Create specific default values based on table type
            if (sTableId === "Customers") {
                oEmptyData.SAPcustId = ""; // Will be auto-generated
                oEmptyData.customerName = ""; // User will fill this
                // oEmptyData.city = ""; // User will fill this
                // oEmptyData.segment = ""; // Optional, user can fill
                oEmptyData.state = ""; // Optional, user can fill
                oEmptyData.country = ""; // User will fill this
                oEmptyData.status = "Active"; // Default to Active (CustomerStatusEnum: A = 'Active')
                oEmptyData.vertical = "BFS"; // ✅ UPDATED: Default to BFS (VerticalEnum value)
            } else if (sTableId === "Employees") {
                oEmptyData.ohrId = ""; // Will be auto-generated
                oEmptyData.mailid = ""; // User will fill this
                oEmptyData.fullName = ""; // User will fill this
                // oEmptyData.lastName = ""; // User will fill this
                oEmptyData.gender = "Male"; // Default to Male (GenderEnum)
                oEmptyData.employeeType = "FullTime"; // Default to FullTime (EmployeeTypeEnum)
                oEmptyData.doj = new Date().toISOString().split('T')[0]; // Today's date
                oEmptyData.band = ""; // User will fill this (EmployeeBandEnum)
                oEmptyData.role = ""; // User will fill this
                oEmptyData.location = ""; // User will fill this
                oEmptyData.supervisorOHR = ""; // User will fill this
                oEmptyData.skills = ""; // User will fill this
                oEmptyData.city = ""; // User will fill this
                oEmptyData.lwd = ""; // Optional, user can fill
                oEmptyData.status = "Allocated"; // Default to Allocated (EmployeeStatusEnum)
            } else if (sTableId === "Opportunities") {
                oEmptyData.sapOpportunityId = ""; // Will be auto-generated
                oEmptyData.sfdcOpportunityId = ""; // User will fill this
                oEmptyData.opportunityName = ""; // User will fill this
                oEmptyData.businessUnit = ""; // User will fill this
                oEmptyData.probability = "ProposalStage"; // Default to 0%-ProposalStage (ProbabilityEnum)
                oEmptyData.salesSPOC = ""; // User will fill this
                oEmptyData.deliverySPOC = ""; // User will fill this
                oEmptyData.expectedStart = new Date().toISOString().split('T')[0]; // Today
                oEmptyData.expectedEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days from now
                // oEmptyData.estimatedRevenue = "0.00"; // Default revenue
                oEmptyData.Stage = "Discover"; // Default stage (OpportunityStageEnum)
                oEmptyData.customerId = ""; // Default customer ID
            }
            else if (sTableId === "Projects") {
                oEmptyData.sapPId = ""; // Will be auto-generated
                oEmptyData.sfdcPId = ""; // User will fill this
                oEmptyData.projectName = ""; // User will fill this
                oEmptyData.startDate = new Date().toISOString().split('T')[0]; // Today
                oEmptyData.endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 90 days from now
                oEmptyData.gpm = ""; // User will fill this
                oEmptyData.projectType = "Fixed Price"; // Default project type (ProjectTypeEnum)
                oEmptyData.oppId = ""; // Default opportunity ID
                oEmptyData.status = "Planned"; // Default status (ProjectStatusEnum)
            }
            // else if (sTableId === "SAPIdStatuses") {
            //     oEmptyData.id = ""; // Will be auto-generated
            //     oEmptyData.status = "A"; // Default to Allocated
            // }

            // 🚨 DON'T add client-side properties to the data that goes to server
            // These properties are added separately after context creation
            return oEmptyData;
        },
        // segemented button
        onToggleRowDetail: function (oEvent) {
            const sKey = oEvent.getParameters("key").item.mProperties.key;

            // Detect which table is currently visible
            const aTableIds = ["Opportunities", "Employees", "Customers", "Projects", "SAPIdStatuses"]; // ✅ REMOVED: "Verticals"
            aTableIds.forEach((sTableId) => {
                const oTable = this.byId(sTableId);
                if (oTable && oTable.getVisible()) {
                    if (sKey === "more") {
                        // Show more: remove show-less, add show-more
                        oTable.removeStyleClass("show-less");
                        oTable.addStyleClass("show-more");
                        console.log(`[Toggle] Table ${sTableId} set to show-more`);
                    } else {
                        // Show less: remove show-more, add show-less
                        oTable.removeStyleClass("show-more");
                        oTable.addStyleClass("show-less");
                        console.log(`[Toggle] Table ${sTableId} set to show-less`);
                    }
                }
            });
        },
        _generateNextIdFromBinding: function (oTable, sEntitySet, sIdField, sPrefix) {
            const pad = (n) => String(n).padStart(4, "0");
            const pattern = /(\d+)$/;
            let max = 0;

            try {
                const oBinding = oTable.getBinding("items") || oTable.getBinding("rows") || (oTable.getRowBinding && oTable.getRowBinding());
                if (oBinding && typeof oBinding.getContexts === "function") {
                    const aCtxs = oBinding.getContexts(0, 5000) || [];
                    aCtxs.forEach(ctx => {
                        try {
                            const oObj = ctx.getObject ? ctx.getObject() : (ctx && ctx.getProperty ? ctx.getProperty("/") : null);
                            const id = oObj && oObj[sIdField];
                            if (id) {
                                const m = String(id).match(pattern);
                                if (m) max = Math.max(max, parseInt(m[1], 10));
                            }
                        } catch (e) { }
                    });
                }

                const oModel = this.getView().getModel();
                if (oModel) {
                    try {
                        const aAll = oModel.getProperty(`/${sEntitySet}`);
                        if (Array.isArray(aAll)) {
                            aAll.forEach(item => {
                                const id = item && item[sIdField];
                                if (id) {
                                    const m = String(id).match(pattern);
                                    if (m) max = Math.max(max, parseInt(m[1], 10));
                                }
                            });
                        }
                    } catch (e) { }
                }

                try {
                    const oEdit = this.getView().getModel("edit");
                    if (oEdit) {
                        const sPaths = oEdit.getProperty("/editingPath") || "";
                        if (sPaths) {
                            const aPaths = sPaths.split(",").filter(Boolean);
                            aPaths.forEach(p => {
                                try {
                                    const oExisting = oModel.getProperty(p);
                                    if (oExisting && oExisting[sIdField]) {
                                        const m = String(oExisting[sIdField]).match(pattern);
                                        if (m) max = Math.max(max, parseInt(m[1], 10));
                                    }
                                } catch (e) { }
                            });
                        }
                    }
                } catch (e) { }

            } catch (e) {
                console.warn(`Could not scan binding for existing ${sIdField} values`, e);
            }

            const next = max + 1;
            return `${sPrefix}-${pad(next)}`;
        },
        onFilterSearch: function (oEvent) {
            console.log("🔍 FilterBar search triggered - event:", oEvent);

            // Get the source FilterBar
            const oFilterBar = oEvent.getSource();
            const sFilterBarId = oFilterBar.getId();

            // Map FilterBar IDs to corresponding Table IDs
            const filterToTableMap = {
                "customerFilterBar": "Customers",
                "employeeFilterBar": "Employees",
                "opportunityFilterBar": "Opportunities",
                "projectsFilterBar": "Projects"
                // ✅ REMOVED: "verticalsFilterBar": "Verticals"
                // Add more mappings as needed
            };

            const sTableId = filterToTableMap[sFilterBarId];
            if (!sTableId) {
                console.warn("❌ No table mapping found for FilterBar ID:", sFilterBarId);
                return;
            }

            const oTable = this.byId(sTableId);
            if (oTable && typeof oTable.rebind === "function") {
                oTable.rebind();
                console.log(`✅ Table '${sTableId}' rebound on filter search`);
            } else if (oTable && typeof oTable.bindRows === "function") {
                oTable.bindRows();
                console.log(`✅ Table '${sTableId}' rebind fallback called (bindRows)`);
            } else {
                console.warn(`❌ Table '${sTableId}' not found or not ready for rebind.`);
            }
        },
        _onUploadPress: function (oEvent) {
            console.log(oEvent);

            var oView = this.getView();
            const oButton = oEvent.getSource();
            const sButtonId = oButton.getId().split('--').pop();
            console.log("oView in upload press", sButtonId);




            // Check if fragment already exists
            if (!this._pDialog) {
                this._pDialog = new sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "glassboard.view.fragments.UploadDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pDialog.then(function (oDialog) {
                oDialog.data("uploadButtonId", sButtonId)
                console.log("oDialog in dialog ", oDialog);

                oDialog.open();
            });

        },
        _onCloseUpload: function () {
            this.byId("uploadDialog").close();
        },
        _onSplitButtonArrowPress: function (oEvent) {

            this.oEventStore = oEvent;
            const oSource = this.oEventStore.getSource();

            if (!this._oMenu) {
                this._oMenu = new sap.m.Menu({
                    items: [
                        new sap.m.MenuItem({
                            text: "Upload Template",
                            tooltip: "Upload",
                            press: () => this.onUpload(this.oEventStore)
                        }),
                        new sap.m.MenuItem({
                            text: "Download Template",
                            tooltip: "Download Template",
                            press: () => this.exportUploadTemplate(this.oEventStore)
                        })
                    ]
                });
            }
            this._oMenu.openBy(oSource);

        },
        _onFileUploadChange: function (oEvent) {
            const oMessageManager = sap.ui.getCore().getMessageManager();
            oMessageManager.removeAllMessages(); //  Clear old messages first
            const oFileUploader = oEvent.getSource();
            const oFile = oFileUploader.oFileUpload.files[0];
            const that = this;

            const oView = this.getView();
            const oDialog = oView.byId("uploadDialog");

            console.log("it is file upload change");





            if (!oFile) {
                sap.m.MessageToast.show("Please select a CSV file.");
                return;
            }

            const oReader = new FileReader();
            oReader.onload = function (oE) {
                const sText = oE.target.result;
                const aLines = sText.split(/\r?\n/);
                console.log("aLines", aLines);


                if (aLines.length < 2) {
                    const oMessageManager = sap.ui.getCore().getMessageManager();
                    const oErrorMessage = new sap.ui.core.message.Message({
                        message: "CSV must have header and at least one data row.",
                        type: sap.ui.core.MessageType.Error,
                        target: "/Dummy",
                        processor: that.getView().getModel()
                    });
                    oMessageManager.addMessages(oErrorMessage);
                    return;
                }

                //new validation
                if (aLines.length < 2) {
                    sap.m.MessageBox.error("CSV must have header and at least one data row.");
                    return;
                }



                const sButtonId = oDialog.data("uploadButtonId");
                console.log("sButton", sButtonId);


                const mExpectedHeaders = {
                    "customerUpload": [
                        "customerName",
                        "state", "country", "status", "vertical",
                    ],
                    "opportunityUpload": [
                        "opportunityName", "sfdcOpportunityId", "businessUnit", "probability",
                        "salesSPOC", "expectedStart", "expectedEnd", "deliverySPOC",
                        "Stage",
                    ],
                    "employeeUpload": [
                        "ohrId", "mailid", "fullName", "gender", "employeeType", "doj", "band", "role", "location", "supervisorOHR", "skills", "city", "lwd", "status",

                    ],
                    "projectUpload": [
                        "sfdcPId", "projectName", "startDate",
                        "endDate", "gpm", "projectType",
                        "oppId", "status",
                    ],
                    "verticalUpload": [
                        "id", "verticalName"

                    ],

                };
                const mExpectedMessage = {
                    "customerUpload": "Customers",
                    "opportunityUpload": "Opportunities",
                    "employeeUpload": "Employees",
                    "projectUpload": "Projects",
                    "verticalUpload": "Verticals"
                };

                const aHeaders = aLines[0].split(",").map(h => h.trim());
                console.log("aHeaders", aHeaders);


                // Validate headers
                const aMissingHeaders = mExpectedHeaders[sButtonId].filter(h => !aHeaders.includes(h));
                const aExtraHeaders = aHeaders.filter(h => !mExpectedHeaders[sButtonId].includes(h));

                console.log(aMissingHeaders);
                console.log(aExtraHeaders);

                if (aMissingHeaders.length > 0 || aExtraHeaders.length > 0) {
                    const oMessageManager = sap.ui.getCore().getMessageManager();


                    const oHeaderMessage = new sap.ui.core.message.Message({
                        message: `Invalid CSV template for ${mExpectedMessage[sButtonId]}`,
                        type: sap.ui.core.MessageType.Error,
                        description: `Missing: ${aMissingHeaders.join(", ") || "None"} | Unexpected: ${aExtraHeaders.join(", ") || "None"}`,
                        target: "/Dummy",
                        processor: that.getView().getModel()
                    });
                    oMessageManager.addMessages(oHeaderMessage);
                    return;
                }

                //new validation
                if (aMissingHeaders.length > 0 || aExtraHeaders.length > 0) {
                    sap.m.MessageBox.error(
                        `Invalid CSV template for ${mExpectedMessage[sButtonId]}`,
                        {
                            title: "Invalid File",
                            details: `Missing: ${aMissingHeaders.join(", ") || "None"} | Unexpected: ${aExtraHeaders.join(", ") || "None"}`
                        }
                    );
                    return;
                }


                // ✅ Parse CSV if headers are valid
                const aPayloadArray = [];
                for (let i = 1; i < aLines.length; i++) {
                    if (!aLines[i].trim()) continue;
                    const aRow = aLines[i].split(",");
                    const oRecord = {};
                    aHeaders.forEach((sHeader, iIndex) => {
                        oRecord[sHeader] = aRow[iIndex]?.trim();
                    });

                    aPayloadArray.push(oRecord);
                }

                console.log("✅ Parsed CSV Payload:", aPayloadArray);
                that._csvPayload = aPayloadArray; // Save parsed payload
                sap.m.MessageToast.show("✅ CSV file validated and parsed successfully!");
            };

            oReader.readAsText(oFile);
        },
        _onMessagePopoverPress: function (oEvent) {
            console.log("onMessagePopoverPress");

            var oSourceControl = oEvent.getSource(); // The button that was clicked
            this.getMessagePopover(this).then(function (oMessagePopover) {
                oMessagePopover.openBy(oSourceControl); // Open the MessagePopover anchored to the button
            });
        },
        _getMessagePopover: function (oController) {
            const oView = oController.getView();
            if (!oController._pMessagePopover) {
                oController._pMessagePopover = new sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "glassboard.view.fragments.MessagePopover"
                }).then(function (oMessagePopover) {
                    oView.addDependent(oMessagePopover);
                    return oMessagePopover;
                });
            }
            return oController._pMessagePopover;
        },
        _onFileUploadSubmit: async function () {
            const oView = this.getView();
            const oDialog = oView.byId("uploadDialog");

            const oMainModel = this.getView().getModel();

            // const sEmail = this.getView().getModel("onBehalfOfUserModel")?.getProperty("/EmailAddress");

            const oMessageManager = sap.ui.getCore().getMessageManager();
            oMessageManager.removeAllMessages();

            // const sSelectedKey = this.byId("entryTypeSelect");
            const sButtonId = oDialog.data("uploadButtonId");
            if (!this._csvPayload?.length) {
                sap.m.MessageToast.show("Please parse a CSV file first.");
                return;
            }

            console.log(sButtonId);

            const mEntityMap = {
                customerUpload: "/Customers",
                opportunityUpload: "/Opportunities",
                employeeUpload: "/Employees",
                verticalUpload: "/Verticals",
                projectUpload: "/Projects",
            };
            const sEntitySet = mEntityMap[sButtonId];
            if (!sEntitySet) return sap.m.MessageBox.error("Invalid entry type selected.");

            sap.m.MessageToast.show(`📤 Uploading ${this._csvPayload.length} records...`);
            // 🔹 Start Busy Indicator for the whole view
            oView.setBusy(true);

            const oUploadBtn = sap.ui.getCore().byId("uploadSubmitBtn");
            if (oUploadBtn) oUploadBtn.setBusy(true);

            const sServiceUrl = oMainModel?.sServiceUrl || "";
            let sCsrfToken = null;
            try {
                const oTokenRes = await fetch(sServiceUrl, {
                    method: "GET",
                    headers: { "X-CSRF-Token": "Fetch" },
                    //  headers: sEmail ? { "X-onbehalfof-User": sEmail } : {},
                    credentials: "same-origin"
                });
                sCsrfToken = oTokenRes.headers.get("x-csrf-token");
            } catch (oError) {
                console.warn("CSRF token fetch failed:", oError);
            }

            let iSuccessCount = 0, iFailureCount = 0;
            const aMessages = [];

            // ✅ Close the dialog before starting upload
            if (this._pDialog) {
                this._pDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
            for (const [iIndex, oRecord] of this._csvPayload.entries()) {

                try {
                    const oRes = await fetch(`${sServiceUrl}${sEntitySet}`, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json;odata.metadata=minimal",
                            ...(sCsrfToken && { "X-CSRF-Token": sCsrfToken }),
                        },
                        body: JSON.stringify(oRecord)
                    });

                    const sText = await oRes.text();
                    let sBackendMsg = "";
                    try {
                        const oParsed = JSON.parse(sText);
                        sBackendMsg = oParsed?.Message || oParsed?.message || oParsed?.error?.message || oParsed?.d?.error?.message || "";
                    } catch {
                        sBackendMsg = sText;
                    }

                    if (oRes.status === 201) {
                        iSuccessCount++;
                        aMessages.push(new sap.ui.core.message.Message({
                            message: `✅ Record ${iIndex + 1} uploaded successfully`,
                            type: sap.ui.core.MessageType.Success,
                            description: sBackendMsg || "HTTP 201 Created",
                            additionalText: `Record Index: ${iIndex + 1}`,
                            target: "/Dummy",
                            processor: this.getView().getModel()
                        }));
                    } else {
                        iFailureCount++;
                        aMessages.push(new sap.ui.core.message.Message({
                            message: `❌ Record ${iIndex + 1} failed: ${sBackendMsg || oRes.statusText}`,
                            type: sap.ui.core.MessageType.Error,
                            description: `HTTP ${oRes.status} ${oRes.statusText}`,
                            additionalText: `Record Index: ${iIndex + 1}`,
                            target: "/Dummy",
                            processor: this.getView().getModel()
                        }));
                    }
                } catch (oError) {
                    iFailureCount++;
                    aMessages.push(new sap.ui.core.message.Message({
                        message: `❌ Record ${iIndex + 1} failed: Network/Unexpected error`,
                        type: sap.ui.core.MessageType.Error,
                        description: oErr.message || JSON.stringify(oError),
                        additionalText: `Record Index: ${iIndex + 1}`,
                        target: "/Dummy",
                        processor: this.getView().getModel()
                    }));
                }
            }

            if (oUploadBtn) oUploadBtn.setBusy(false);
            oMessageManager.addMessages(aMessages);
            this.getView().getModel("message").setData(oMessageManager.getMessageModel().getData());

            this._csvPayload = null;
            await oMainModel.refresh();
            // this._configureTable();
            // 🔹 Stop Busy Indicator
            oView.setBusy(false);

            sap.m.MessageToast.show(`📋 Upload complete: ${iSuccessCount} success, ${iFailureCount} failed`);

        },

        _updateMessageButtonIcon: function (oController) {
            const oView = oController.getView();
            const aMessages = oView.getModel("message").getData();
            console.log("aMessages in updateMessageButtonIcon", aMessages);

            const oButton = oView.byId("uploadLogButton");
            console.log(oButton);


            if (oButton) {
                if (aMessages && aMessages.length > 0) {
                    const oLastMessage = aMessages[aMessages.length - 1];
                    const sType = oLastMessage.type;

                    if (sType === "Error") {
                        oButton.setIcon("sap-icon://error");
                        oButton.setType("Negative");
                    } else if (sType === "Success") {
                        oButton.setIcon("sap-icon://sys-enter-2");
                        oButton.setType("Success");
                    } else {
                        oButton.setIcon("sap-icon://alert");
                        oButton.setType("Default");
                    }
                } else {
                    // Reset when there are no messages
                    oButton.setIcon("sap-icon://message-popup");
                    oButton.setType("Default");
                }
            }
        },
        _exportUploadTemplate: function (oEvent) {


            const sButtonId = oEvent.getSource().getId().split("--").pop();


            const mExpectedHeaders = {
                "customerUpload": [
                    "customerName",
                    "state", "country", "status", "vertical",
                ],
                "opportunityUpload": [
                    "opportunityName", "sfdcOpportunityId", "businessUnit", "probability",
                    "salesSPOC", "expectedStart", "expectedEnd", "deliverySPOC",
                    "Stage",
                ],
                "employeeUpload": [
                    "ohrId", "mailid", "fullName",
                    "gender", "employeeType", "doj", "band", "role", "location", "supervisorOHR", "skills", "city", "lwd", "status",

                ],
                "projectUpload": [
                    "sfdcPId", "projectName", "startDate",
                    "endDate", "gpm", "projectType",
                    "oppId", "status",
                ],
                "verticalUpload": [
                    "id", "verticalName"

                ],

            };



            // collect property keys
            const aKeys = mExpectedHeaders[sButtonId]

            // CSV string
            let sCSV = "\uFEFF" + aKeys.join(",") + "\n";


            const mExpectedMessage = {
                "customerUpload": "Customers",
                "opportunityUpload": "Opportunities",
                "employeeUpload": "Employees",
                "projectUpload": "Projects",
                "verticalUpload": "Verticals"
            };
            const sFileBase = mExpectedMessage[sButtonId]
            const sFileName = `${sFileBase}_Template.csv`;

            this.downloadCSV(sCSV, sFileName);

        },
        _downloadCSV: function (sContent, sFileName) {
            const oLink = document.createElement("a");
            oLink.href = URL.createObjectURL(new Blob([sContent], { type: "text/csv;charset=utf-8;" }));
            oLink.download = sFileName;
            oLink.style.display = "none";
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
        },

        onDemandPress: function() {
            console.log(' Define Demand');
            const oAllocationPage = this.byId("allocationPage");
            oAllocationPage.destroyContent();     
            


                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Demands", // adjust path if needed
                    controller: this
                }).then(function (oFragment) {
                    oAllocationPage.addContent(oFragment);

                    const oTable = this.byId("Demands");

                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    this.initializeTable("Demands");
                    this._resetSegmentedButtonForFragment("Demands");
                }.bind(this));
             
        },
        onBackToProjectsPress: function () {
            console.log("back to projects");
            const oAllocationPage = this.byId("allocationPage");

            // Clear current content (i.e., Demands fragment)
            oAllocationPage.destroyContent();

            // Load Allocations fragment again
                

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Allocations",
                    controller: this
                }).then(function (oFragment) {
                    oAllocationPage.addContent(oFragment);

                    const oTable = this.byId("Allocations");

                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    this.initializeTable("Allocations");
                    this._resetSegmentedButtonForFragment("Allocations");
                }.bind(this));
           
        },
        onResourcesPress: function() {
            console.log("Resources");
            const oAllocationPage = this.byId("allocationPage");
            oAllocationPage.destroyContent();

            
            
    

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Resources", // adjust path if needed
                    controller: this
                }).then(function (oFragment) {
                    oAllocationPage.addContent(oFragment);

                    const oTable = this.byId("Resources");

                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    this.initializeTable("Resources");
                    this._resetSegmentedButtonForFragment("Resources");
                }.bind(this));
            
        },
        onBack: function() {
            const oAllocationPage = this.byId("allocationPage");
            oAllocationPage.destroyContent();

            
            


                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Demands", // adjust path if needed
                    controller: this
                }).then(function (oFragment) {
                    oAllocationPage.addContent(oFragment);

                    const oTable = this.byId("Demands");

                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    this.initializeTable("Demands");
                    this._resetSegmentedButtonForFragment("Demands");
                }.bind(this));

        },
        onAllocateRes: function() {  
            console.log("dialog"); 
            
            if (!this._oAllocateDialog) {
                this._oAllocateDialog = sap.ui.xmlfragment("glassboard.view.fragments.AllocateDialog", this);
                this.getView().addDependent(this._oAllocateDialog);
            }

            this._oAllocateDialog.open();
        },
        
        onAllocateConfirm: function () {
        sap.m.MessageToast.show("Successfully allocated!");
        this._oAllocateDialog.close();
        },

        onDialogClose: function () {
        this._oAllocateDialog.close();
        },

        onAllocateResource : function() {
            sap.m.MessageToast.show("Successfully allocated!");
        },

         

        
        onSelection: function (oEvent) {
            var selectedKey = oEvent.getParameter("selectedItem").getKey();
            console.log("hi",selectedKey);

            if (selectedKey === "employees") {
                // sap.m.MessageToast.show("Employees selected");
                const oAllocationPage = this.byId("allocationPage");
                oAllocationPage.destroyContent();              
    

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Res", // adjust path if needed
                    controller: this
                }).then(function (oFragment) {
                    oAllocationPage.addContent(oFragment);

                    const oTable = this.byId("Res");

                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    this.initializeTable("Res");
                    this._resetSegmentedButtonForFragment("Res");
                }.bind(this));
                // Your logic here
            } else if (selectedKey === "projects") {
                // sap.m.MessageToast.show("Projects selected");
                // Your logic here
                const oAllocationPage = this.byId("allocationPage");
                oAllocationPage.destroyContent();          
            
    

                Fragment.load({
                    id: this.getView().getId(),
                    name: "glassboard.view.fragments.Allocations", // adjust path if needed
                    controller: this
                }).then(function (oFragment) {
                    oAllocationPage.addContent(oFragment);

                    const oTable = this.byId("Allocations");

                    oTable.removeStyleClass("show-more");
                    oTable.addStyleClass("show-less");

                    const oModel = this.getOwnerComponent().getModel();
                    if (oModel) {
                        oTable.setModel(oModel);
                    }

                    this.initializeTable("Allocations");
                    this._resetSegmentedButtonForFragment("Allocations");
                }.bind(this));
            }
        }





    });
});