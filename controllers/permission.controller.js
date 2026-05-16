const Permission = require('../models/permission.model');
const Role = require('../models/role.model');
const ResponseHelper = require('../helpers/response');
const mongoose = require('mongoose');

class PermissionController {
  /**
   * @param req request body
   * @param res callback response object
   * @description Method to get permissions listing
   */
  static async index(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const permissions = await Permission.find();
      
      response.success = true;
      response.message = 'Permissions listing.';
      response.data = permissions?.length ? permissions : {};
      response.status = 200;
    } catch (error) {
      console.error('permissionIndexError: ', error);
      response.message = error.message || 'An internal server error occurred';
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to view single permission
   */
  static async view(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const { id } = req.params;
      const permission = await Permission.findOne({
        _id: id,
      });

      if (permission) {
        response.success = true;
        response.message = 'Permission.';
        response.data = permission;
        response.status = 200;
      }
    } catch (err) {
      console.log('permissionViewError: ', err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to create permission
   */
  static async create(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const { permissionName } = req.body;

      const checkIfPermissionExists = await Permission.findOne({
        permissionName,
      });

      if (checkIfPermissionExists) {
        response.success = false;
        response.message = 'Permission already exists with this name.';
        response.status = 400;
        return;
      }

      const createPermission = await Permission.create({ permissionName });
      if (createPermission) {
        response.success = true;
        response.message = 'Permission created successfully.';
        response.data = createPermission;
        response.status = 200;
      }
    } catch (err) {
      console.log('permissionCreateError', err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to update permission
   */
  static async edit(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const { id } = req.params;
      const { permissionName } = req.body;

      const permission = await Permission.findOne({ _id: id });

      if (!permission) {
        response.message = 'Permission not found.';
        return;
      }

      if (permission?.permissionName === permissionName) {
        response.message = 'Duplicate permission name.';
        return;
      }

      const isPermissionAssignedToRole = await Role.exists({
        permissions: permission.permissionName,
      });

      if (isPermissionAssignedToRole) {
        response.status = 400;
        response.message =
          'Permission is assigned to one or more roles and cannot be deleted.';
        return;
      }

      const updatePermission = await Permission.updateOne(
        { _id: permission?._id },
        {
          $set: {
            permissionName: permissionName
              ? permissionName
              : permission?.permissionName,
          },
        }
      );

      if (updatePermission) {
        response.status = 200;
        response.success = true;
        response.message = 'Permission updated successfully.';
      }
    } catch (err) {
      console.log('permissionEditError', err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to delete permission
   */
  static async remove(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        response.status = 400;
        response.message = 'Invalid ID format';
        return;
      } 

      const permission = await Permission.findOne({ _id: id });

      if (!permission) {
        response.status = 404;
        response.message = 'Permission not found.';
        return;
      }

      // Check if the permissionName is assigned to any roles
      const isPermissionAssignedToRole = await Role.exists({
        permissions: permission.permissionName,
      });

      if (isPermissionAssignedToRole) {
        response.status = 400;
        response.message =
          'Permission is assigned to one or more roles and cannot be deleted.';
        return;
      }

      const deletePermission = await Permission.deleteOne({ _id: id });

      if (deletePermission.deletedCount > 0) {
        response.status = 200;
        response.success = true;
        response.message = 'Permission deleted successfully.';
        return;
      }

      response.status = 500;
      response.message = 'Failed to delete the permission.';
    } catch (err) {
      console.error('PermissionRemoveError:', err);
      response.status = 500;
      response.message = 'Internal server error';
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = PermissionController;
