"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  ChevronDownIcon,
  GridIcon,
  ListIcon,
  PieChartIcon,
  PlugInIcon,
} from "../icons/index";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string }[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/",
  },
  {
    name: "Products",
    icon: <BoxCubeIcon />,
    subItems: [
      { name: "Products", path: "/products" },
      { name: "Warehouses", path: "/warehouses" },
      { name: "Inventory Movements", path: "/inventory/movements" },
      { name: "Stock Adjustments", path: "/inventory/stock-adjustments" },
    ],
  },
  {
    name: "Partners",
    icon: <BoxCubeIcon />,
    subItems: [
      { name: "Business Partners", path: "/business-partners" },
      { name: "Employees", path: "/settings/employees" },
    ],
  },
  {
    name: "Accounting",
    icon: <BoxCubeIcon />,
    subItems: [
      { name: "Chart of Accounts", path: "/accounting/chart-of-accounts" },
      { name: "Cost Centers", path: "/accounting/cost-centers" },
      { name: "Entries", path: "/accounting/entries" },
    ],
  },
  {
    name: "Invoice",
    icon: <ListIcon />,
    subItems: [
      { name: "Purchase Orders", path: "/purchase-orders" },
      { name: "Sales", path: "/invoice/sales" },
      { name: "Purchase", path: "/invoice/purchase" },
      { name: "Credit Note", path: "/invoice/credit-note" },
      { name: "Debit Note", path: "/invoice/debit-note" },
    ],
  },
  {
    name: "Report",
    icon: <PieChartIcon />,
    subItems: [
      { name: "Ledger", path: "/report/ledger" },
      { name: "Trial Balance", path: "/report/trial-balance" },
      { name: "Income Statement", path: "/report/income-statement" },
      { name: "Balance Sheet", path: "/report/balance-sheet" },
      { name: "Aging & Analysis", path: "/report/aging" },
      { name: "Inventory Valuation", path: "/report/inventory-valuation" },
      { name: "Tax Summary", path: "/report/tax-summary" },
    ],
  },
  {
    icon: <PieChartIcon />,
    name: "Audit",
    subItems: [
      { name: "Audit Log", path: "/audit" },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Settings",
    subItems: [
      { name: "Posting Profiles", path: "/settings/posting-profiles" },
      { name: "Tax Setup", path: "/settings/tax-setup" },
      { name: "Entry Categories", path: "/settings/entry-categories" },
      { name: "Document Sequences", path: "/settings/document-sequences" },
      { name: "System Settings", path: "/settings" },
      { name: "User Management", path: "/users" },
      { name: "My Profile", path: "/profile" },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Authentication",
    subItems: [
      { name: "Sign In", path: "/signin" },
      { name: "Reset Password", path: "/reset-password" },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    let matched = false;
    navItems.forEach((nav, index) => {
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          if (isActive(subItem.path)) {
            setOpenIndex(index);
            matched = true;
          }
        });
      }
    });
    if (!matched) setOpenIndex(null);
  }, [pathname, isActive]);

  useEffect(() => {
    if (openIndex !== null) {
      const key = `nav-${openIndex}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prev) => ({
          ...prev,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openIndex]);

  const handleToggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <span className="text-xl font-bold text-gray-900 dark:text-white">Nexus</span>
          ) : (
            <span className="text-lg font-bold text-gray-900 dark:text-white">N</span>
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <ul className="flex flex-col gap-4">
            {navItems.map((nav, index) => (
              <li key={nav.name}>
                {nav.subItems ? (
                  <button
                    onClick={() => handleToggle(index)}
                    className={`menu-item group  ${
                      openIndex === index
                        ? "menu-item-active"
                        : "menu-item-inactive"
                    } cursor-pointer ${
                      !isExpanded && !isHovered
                        ? "lg:justify-center"
                        : "lg:justify-start"
                    }`}
                  >
                    <span
                      className={` ${
                        openIndex === index
                          ? "menu-item-icon-active"
                          : "menu-item-icon-inactive"
                      }`}
                    >
                      {nav.icon}
                    </span>
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <span className="menu-item-text">{nav.name}</span>
                    )}
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <ChevronDownIcon
                        className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                          openIndex === index
                            ? "rotate-180 text-brand-500"
                            : ""
                        }`}
                      />
                    )}
                  </button>
                ) : (
                  nav.path && (
                    <Link
                      href={nav.path}
                      className={`menu-item group ${
                        isActive(nav.path)
                          ? "menu-item-active"
                          : "menu-item-inactive"
                      }`}
                    >
                      <span
                        className={`${
                          isActive(nav.path)
                            ? "menu-item-icon-active"
                            : "menu-item-icon-inactive"
                        }`}
                      >
                        {nav.icon}
                      </span>
                      {(isExpanded || isHovered || isMobileOpen) && (
                        <span className="menu-item-text">{nav.name}</span>
                      )}
                    </Link>
                  )
                )}
                {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
                  <div
                    ref={(el) => {
                      subMenuRefs.current[`nav-${index}`] = el;
                    }}
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      height:
                        openIndex === index
                          ? `${subMenuHeight[`nav-${index}`]}px`
                          : "0px",
                    }}
                  >
                    <ul className="mt-2 space-y-1 ml-9">
                      {nav.subItems.map((subItem) => (
                        <li key={subItem.name}>
                          <Link
                            href={subItem.path}
                            className={`menu-dropdown-item ${
                              isActive(subItem.path)
                                ? "menu-dropdown-item-active"
                                : "menu-dropdown-item-inactive"
                            }`}
                          >
                            {subItem.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>

      </div>
    </aside>
  );
};

export default AppSidebar;
