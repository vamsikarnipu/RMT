sap.ui.define([
    "sap/ui/core/UIComponent",
    "glassboard/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("glassboard.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();
            sap.ui.getCore().loadLibrary("sap.ui.core");
            jQuery.sap.includeStyleSheet("glassboard/css/style.css");
        }
    });
});