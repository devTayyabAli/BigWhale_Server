const Role = require('../models/role.model');
const User = require('../models/user.model');
const ResponseHelper = require('../helpers/response');

class RoleController {
  /**
   * @param req request body
   * @param res callback response object
   * @description Method to get roles listing
   */
  static async index(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const roles = await Role.find();
      if (roles) {
        response.success = true;
        response.message = 'Roles listing.';
        response.data = roles;
        response.status = 200;  
      }
    } catch (error) {
      console.error('roleError: ', error);    
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
   * @description Method to view single role
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

      const role = await Role.findOne({
        _id: id,
      });

      if (!role) {
        response.message = 'Email or password is incorrect.';
      }

      if (role) {
        response.success = true;
        response.message = 'Role.';
        response.data = role;
        response.status = 200;
        return;
      }

      response.success = false;
      response.message = 'Please verify you account to continue.';
      response.data = {};
      response.status = 400;
    } catch (err) {
      console.log('roleViewError', err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to create role
   */
  static async create(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const { roleName, permissions } = req.body;

      const role = await Role.create({
        roleName,
        permissions,
      });

      if (role) {
        response.success = true;
        response.message = 'Role created successfully.';
        response.data = role;
        response.status = 200;
      }
    } catch (err) {
      console.log('roleCreateError', err);
      response.message = err;
      response.status = 500;   
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to update role
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
      const { roleName, permissions } = req.body;

      const role = await Role.findOne({ _id: id });

      if (!role) {
        response.message = 'Role not found.';
      }

      const updateUser = await Role.updateOne(
        { _id: role?._id },
        {
          $set: {
            roleName: roleName ? roleName : role?.roleName,
            permissions: permissions ? permissions : role?.permissions,
          },
        }
      );

      if (updateUser) {
        response.status = 200;
        response.success = true;
        response.message = 'Role updated successfully.';
      }
    } catch (err) {
      console.log('roleUpdateError: ', err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to delete role
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

      const role = await Role.findOne({ _id: id });
      if (!role) {
        response.message = 'Role not found.';
      }

      const isRoleAssignedToUser = await User.exists({
        role: role?.roleName,
      });

      if (isRoleAssignedToUser) {
        response.status = 400;
        response.message =
          'Role is assigned to one or more users and cannot be deleted.';
        return;
      }

      const deleteRole = await Role.deleteOne({ _id: role?._id });     
      if (deleteRole) {
        response.status = 200;       
        response.success = true;   
        response.message = 'Role deleted successfully.';
      }
    } catch (err) {
      console.log('roleDeletedError', err);    
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);       
    }
  }
}

module.exports = RoleController;
